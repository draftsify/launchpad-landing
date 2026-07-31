import { formatEther } from "viem";

import { LAUNCHER_ADDRESS, isDeployed, publicClient } from "@/lib/chain";
import { isHidden } from "@/lib/hidden";
import { launcherAbi, lockerAbi, tokenAbi } from "@/lib/launcher";
import { parseMetadata, type TokenMetadata } from "@/lib/metadata";
import type { Rules } from "@/lib/presets";
import { erc20Abi, poolAbi, priceFromSqrt } from "@/lib/uniswap";

/**
 * Un lancement, tel qu'un nœud peut le décrire.
 *
 * Chaque champ ici est lisible en un appel : la liste des tokens vient du
 * launcher, les métadonnées du token lui-même, le prix du tick courant du pool,
 * la liquidité du solde de quote du pool.
 *
 * Ce qui n'y est pas n'y est pas parce qu'un nœud ne le rend pas en une lecture.
 * Le nombre de détenteurs suppose de rejouer tous les transferts, la variation
 * sur 24 h de connaître le prix d'hier : c'est le travail de `lib/indexer.ts`,
 * qui relit les journaux et répond par `/api/activity`. Deux chemins séparés,
 * volontairement — le prix affiché ne doit jamais dépendre de la disponibilité
 * de l'historique.
 *
 * La part de supply encore sous déblocage reste absente : elle supposerait de
 * connaître toutes les positions ouvertes, ce que ni l'état ni les journaux ne
 * donnent sans énumérer les détenteurs un par un.
 */
export type Launch = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  pool: `0x${string}`;
  /** L'autre actif de la paire : le WETH de la chaîne. */
  quoteToken: `0x${string}`;
  /** Secondes epoch. C'est ce qui trie « Recent ». */
  launchedAt: number;
  supply: bigint;
  /** Quote par token, au tick courant. */
  priceEth: number;
  marketCapEth: number;
  /** Quote réellement dans le pool : ce que les acheteurs y ont mis. */
  liquidityEth: number;
  meta: TokenMetadata | null;
  /**
   * Le jalon est atteint : le lancement est « Revealed ».
   *
   * Mesuré sur la position, pas sur le drapeau `graduated` du locker. Ce
   * drapeau est collant et n'est écrit que si quelqu'un appelle
   * `syncGraduation` — un token peut donc avoir franchi le seuil sans que le
   * drapeau le dise, et afficher « pas encore » serait alors faux.
   */
  revealed: boolean;
};

/** Segment d'URL. L'adresse, pas un nom : deux tokens peuvent s'appeler pareil. */
export function slugOf(launch: Pick<Launch, "address">) {
  return launch.address.toLowerCase();
}

async function readLaunch(address: `0x${string}`): Promise<Launch | null> {
  try {
    const base = { address, abi: tokenAbi } as const;
    const [name, symbol, metadataURI, pool, quoteToken, launchedAt, supply] =
      await Promise.all([
        publicClient.readContract({ ...base, functionName: "name" }),
        publicClient.readContract({ ...base, functionName: "symbol" }),
        publicClient.readContract({ ...base, functionName: "metadataURI" }),
        publicClient.readContract({ ...base, functionName: "pool" }),
        publicClient.readContract({ ...base, functionName: "quote" }),
        publicClient.readContract({ ...base, functionName: "launchedAt" }),
        publicClient.readContract({ address, abi: erc20Abi, functionName: "totalSupply" }),
      ]);

    const [slot0, token0, quoteReserve] = await Promise.all([
      publicClient.readContract({ address: pool, abi: poolAbi, functionName: "slot0" }),
      publicClient.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
      // La liquidité réelle est la quote présente dans le pool. Elle vaut zéro
      // au lancement et ne grandit qu'avec les achats : c'est la conséquence
      // directe de la position unilatérale, pas une valeur à afficher comme
      // « fournie » par quelqu'un.
      publicClient.readContract({
        address: quoteToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [pool],
      }),
    ]);

    const tokenIsToken0 = token0.toLowerCase() === address.toLowerCase();
    const priceEth = priceFromSqrt(slot0[0], tokenIsToken0);

    return {
      address,
      name,
      symbol,
      pool,
      quoteToken,
      launchedAt: Number(launchedAt),
      supply,
      priceEth,
      marketCapEth: priceEth * Number(formatEther(supply)),
      liquidityEth: Number(formatEther(quoteReserve)),
      meta: parseMetadata(metadataURI),
      // Renseigné par l'appelant, qui connaît le locker. Faux par défaut : un
      // jalon qu'on n'a pas lu ne s'annonce pas comme atteint.
      revealed: false,
    };
  } catch {
    // Un token illisible ne doit pas emporter la liste entière.
    return null;
  }
}

/**
 * Tous les lancements, du plus récent au plus ancien.
 *
 * Le launcher tient le registre : il n'y a pas de base de données à interroger,
 * et rien à faire confiance à part la chaîne.
 */
export async function readLaunches(): Promise<Launch[]> {
  if (!isDeployed) return [];

  const count = await publicClient.readContract({
    address: LAUNCHER_ADDRESS as `0x${string}`,
    abi: launcherAbi,
    functionName: "tokenCount",
  });

  const indexes = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  const addresses = await Promise.all(
    indexes.map((i) =>
      publicClient.readContract({
        address: LAUNCHER_ADDRESS as `0x${string}`,
        abi: launcherAbi,
        functionName: "tokens",
        args: [i],
      })
    )
  );

  const launches = await Promise.all(addresses.map(readLaunch));
  return markRevealed(
    launches
      .filter((l): l is Launch => l !== null && !isHidden(l.address))
      .sort((a, b) => b.launchedAt - a.launchedAt)
  );
}

/**
 * Les règles réellement appliquées, lues sur le launcher.
 *
 * Elles vivaient jusqu'ici en dur dans `lib/presets.ts`, recopiées à la main
 * depuis le script de déploiement. Deux copies d'un même nombre finissent par
 * diverger, et celle-ci n'est pas décorative : le panneau d'échange s'en sert
 * pour décider quand le premier achat s'ouvre. Un délai affiché plus court que
 * le délai appliqué ferait proposer un achat qui ne peut que revert.
 *
 * Le launcher n'a aucune fonction pour les changer : une lecture suffit.
 */
export async function readRules(): Promise<Rules | null> {
  if (!isDeployed) return null;

  const [initialUnlockBps, unlockSeconds, launchDelay, buyRamp] =
    await publicClient.readContract({
      address: LAUNCHER_ADDRESS as `0x${string}`,
      abi: launcherAbi,
      functionName: "rules",
    });

  return {
    initialUnlock: initialUnlockBps / 100,
    unlockHours: unlockSeconds / 3600,
    launchDelay,
    buyRamp: buyRamp / 60,
  };
}

/**
 * Le plafond d'achat du créateur, en wei de token, lu sur le launcher.
 *
 * Lisible avant qu'un token existe — c'est tout l'intérêt : le formulaire doit
 * pouvoir borner le champ pendant qu'on le remplit, pas sur un échec de
 * signature.
 */
export async function readCreatorBuyCap(): Promise<bigint | null> {
  if (!isDeployed) return null;
  return publicClient.readContract({
    address: LAUNCHER_ADDRESS as `0x${string}`,
    abi: launcherAbi,
    functionName: "creatorBuyCap",
  });
}

/**
 * Marque les lancements qui ont franchi le seuil.
 *
 * Une lecture du seuil pour tout le monde, puis une par token. C'est le prix
 * d'un statut exact : le drapeau `graduated` du contrat coûterait le même
 * nombre d'appels et rendrait faux tant que personne n'a appelé
 * `syncGraduation`.
 */
async function markRevealed(launches: Launch[]): Promise<Launch[]> {
  if (launches.length === 0) return launches;

  try {
    const locker = await publicClient.readContract({
      address: LAUNCHER_ADDRESS as `0x${string}`,
      abi: launcherAbi,
      functionName: "locker",
    });
    const threshold = await publicClient.readContract({
      address: locker,
      abi: lockerAbi,
      functionName: "GRADUATION_QUOTE",
    });

    return await Promise.all(
      launches.map(async (launch) => {
        try {
          const progress = await publicClient.readContract({
            address: locker,
            abi: lockerAbi,
            functionName: "graduationProgress",
            args: [launch.address],
          });
          return { ...launch, revealed: progress >= threshold };
        } catch {
          return launch;
        }
      })
    );
  } catch {
    // Le jalon n'est pas lisible : on n'annonce rien plutôt que d'annoncer non.
    return launches;
  }
}

/** L'adresse qui reçoit les frais. Immuable, donc lue une fois. */
export async function readTreasury(): Promise<`0x${string}` | null> {
  if (!isDeployed) return null;
  const locker = await publicClient.readContract({
    address: LAUNCHER_ADDRESS as `0x${string}`,
    abi: launcherAbi,
    functionName: "locker",
  });
  return publicClient.readContract({
    address: locker,
    abi: lockerAbi,
    functionName: "treasury",
  });
}

export type Claimable = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  /** Quote due à la trésorerie, en wei. */
  quote: bigint;
  /** Tokens dus à la trésorerie, en wei. */
  token: bigint;
};

/**
 * Ce que la position de chaque lancement doit à la trésorerie, maintenant.
 *
 * `owedRecorded` ne sert pas ici : le PositionManager n'inscrit les frais dus
 * qu'au moment où la position est touchée, donc il rend zéro tant que personne
 * n'a collecté — quel qu'ait été le volume. Mesuré sur un lancement réel :
 * `owedRecorded` disait 0/0 pendant qu'une collecte rendait 0,099 ETH.
 *
 * On simule donc `collect` en lecture seule. La simulation traverse le même
 * chemin que la vraie transaction, poke comprise, et rend les montants exacts.
 */
export async function readClaimable(): Promise<Claimable[]> {
  if (!isDeployed) return [];

  const locker = await publicClient.readContract({
    address: LAUNCHER_ADDRESS as `0x${string}`,
    abi: launcherAbi,
    functionName: "locker",
  });
  const launches = await readLaunches();

  const rows = await Promise.all(
    launches.map(async (launch) => {
      try {
        const [position, simulated] = await Promise.all([
          publicClient.readContract({
            address: locker,
            abi: lockerAbi,
            functionName: "positions",
            args: [launch.address],
          }),
          publicClient.simulateContract({
            address: locker,
            abi: lockerAbi,
            functionName: "collect",
            args: [launch.address],
          }),
        ]);

        const quoteIsToken0 = position[6];
        const [amount0, amount1] = simulated.result;
        return {
          address: launch.address,
          name: launch.name,
          symbol: launch.symbol,
          quote: quoteIsToken0 ? amount0 : amount1,
          token: quoteIsToken0 ? amount1 : amount0,
        };
      } catch {
        // Un token illisible ne doit pas emporter la liste entière.
        return null;
      }
    })
  );

  return rows.filter((row): row is Claimable => row !== null);
}

export type Holding = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  balance: bigint;
  /** Ce qui peut sortir maintenant. Le reste attend `unlockSeconds`. */
  releasable: bigint;
};

/**
 * Les tokens Reveal qu'une adresse détient, avec ce qu'elle peut vendre.
 *
 * Sert à la trésorerie, qui reçoit la moitié de ses frais en tokens et veut les
 * ramener en ETH. La part vendable est lue et non déduite : le protocole ne
 * s'exempte pas de ses propres règles, donc ces tokens se libèrent au même
 * rythme que ceux de n'importe qui — un dixième tout de suite, tout au bout
 * d'un quart d'heure.
 */
export async function readHoldings(owner: `0x${string}`): Promise<Holding[]> {
  const launches = await readLaunches();

  const rows = await Promise.all(
    launches.map(async (launch) => {
      try {
        const base = { address: launch.address, abi: tokenAbi } as const;
        const [balance, releasable] = await Promise.all([
          publicClient.readContract({
            ...base,
            functionName: "balanceOf",
            args: [owner],
          }),
          publicClient.readContract({
            ...base,
            functionName: "releasable",
            args: [owner],
          }),
        ]);
        if (balance === 0n) return null;
        return {
          address: launch.address,
          name: launch.name,
          symbol: launch.symbol,
          balance,
          releasable,
        };
      } catch {
        return null;
      }
    })
  );

  return rows.filter((row): row is Holding => row !== null);
}

export async function readLaunchBySlug(slug: string): Promise<Launch | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(slug)) return null;
  // Masqué de la liste veut dire masqué de son adresse directe : sinon un lien
  // partagé continue de servir la page, et le retrait n'en est pas un.
  if (isHidden(slug)) return null;
  const launch = await readLaunch(slug.toLowerCase() as `0x${string}`);
  if (!launch) return null;
  return (await markRevealed([launch]))[0];
}

/** Ce que le locker dit d'un lancement : jalon, et propriété de la position. */
export type Graduation = {
  /** Quote réellement détenue par la position verrouillée, en ETH. */
  progress: number;
  /** Seuil, en ETH. */
  threshold: number;
  /** Jalon enregistré sur la chaîne. Collant : il ne se dé-franchit pas. */
  graduated: boolean;
  /** Vrai dès que le seuil est atteint, même si personne ne l'a encore acté. */
  reached: boolean;
};

/**
 * Lit la graduation d'un token.
 *
 * `progress` ne vient pas du solde WETH du pool mais de la quote que la
 * position verrouillée contient au prix courant. Un virement direct au pool ne
 * la bouge donc pas — c'est ce qui sépare un jalon d'un chiffre qu'on s'offre.
 */
export async function readGraduation(
  token: `0x${string}`
): Promise<Graduation | null> {
  if (!isDeployed) return null;

  const locker = await publicClient.readContract({
    address: LAUNCHER_ADDRESS as `0x${string}`,
    abi: launcherAbi,
    functionName: "locker",
  });

  const [progress, graduated, threshold] = await Promise.all([
    publicClient.readContract({
      address: locker,
      abi: lockerAbi,
      functionName: "graduationProgress",
      args: [token],
    }),
    publicClient.readContract({
      address: locker,
      abi: lockerAbi,
      functionName: "graduated",
      args: [token],
    }),
    publicClient.readContract({
      address: locker,
      abi: lockerAbi,
      functionName: "GRADUATION_QUOTE",
    }),
  ]);

  return {
    progress: Number(formatEther(progress)),
    threshold: Number(formatEther(threshold)),
    graduated,
    reached: progress >= threshold,
  };
}
