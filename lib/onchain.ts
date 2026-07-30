import { formatEther } from "viem";

import { LAUNCHER_ADDRESS, isDeployed, publicClient } from "@/lib/chain";
import { launcherAbi, tokenAbi } from "@/lib/launcher";
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
  return launches
    .filter((l): l is Launch => l !== null)
    .sort((a, b) => b.launchedAt - a.launchedAt);
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

  const [initialUnlockBps, unlockSeconds, impactCapBps, impactWindow, launchDelay, buyRamp] =
    await publicClient.readContract({
      address: LAUNCHER_ADDRESS as `0x${string}`,
      abi: launcherAbi,
      functionName: "rules",
    });

  return {
    initialUnlock: initialUnlockBps / 100,
    unlockHours: unlockSeconds / 3600,
    impactCap: impactCapBps / 100,
    impactWindow: impactWindow / 60,
    launchDelay,
    buyRamp: buyRamp / 60,
  };
}

export async function readLaunchBySlug(slug: string): Promise<Launch | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(slug)) return null;
  return readLaunch(slug.toLowerCase() as `0x${string}`);
}
