import { unstable_cache } from "next/cache";

import { publicClient } from "@/lib/chain";
import { readActivity, readLaunchBlocks, type Activity } from "@/lib/indexer";
import { tokenAbi } from "@/lib/launcher";
import { readLaunches } from "@/lib/onchain";
import { poolAbi } from "@/lib/uniswap";

/**
 * Ce que l'API sert, et comment elle évite de le recalculer.
 *
 * Trente secondes par token : au-delà, une courbe de prix ment sur un marché
 * qui bouge ; en deçà, on relit des journaux identiques.
 *
 * Le point important est ailleurs : le total du protocole passe par la *même*
 * fonction mise en cache que la page d'un token. Deux entrées, un seul travail
 * — sans quoi ouvrir /analytics puis une fiche de token relisait deux fois les
 * mêmes journaux.
 */
const TOKEN_TTL = 30;
const PROTOCOL_TTL = 60;

/**
 * Nombre de pools relus en parallèle.
 *
 * `Promise.all` sur tout le registre ouvrirait autant de requêtes simultanées
 * qu'il y a de tokens. Un nœud public répond à ça par de la limitation de
 * débit, et le remède serait pire que le mal : des lectures qui échouent au
 * lieu de lectures qui attendent.
 */
const CONCURRENCY = 4;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

/** Les blocs de lancement changent seulement quand un token naît. */
const launchBlocks = unstable_cache(readLaunchBlocks, ["launch-blocks"], {
  revalidate: PROTOCOL_TTL,
});

/** Le registre : une dizaine de lectures par token, inutiles à refaire souvent. */
const cachedLaunches = unstable_cache(readLaunches, ["launches"], {
  revalidate: TOKEN_TTL,
});

async function readOne(address: `0x${string}`): Promise<Activity> {
  const pool = await publicClient.readContract({
    address,
    abi: tokenAbi,
    functionName: "pool",
  });
  const token0 = await publicClient.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "token0",
  });

  const blocks = await launchBlocks();

  return readActivity({
    token: address,
    pool,
    tokenIsToken0: token0.toLowerCase() === address.toLowerCase(),
    fromBlock: blocks.get(address.toLowerCase()) ?? 0n,
  });
}

/** L'activité d'un token, mise en cache sous son adresse. */
export function activityOf(address: `0x${string}`) {
  const key = address.toLowerCase();
  return unstable_cache(() => readOne(key as `0x${string}`), ["activity", key], {
    revalidate: TOKEN_TTL,
  })();
}

export type TokenActivity = {
  address: string;
  volume24h: number;
  volumeTotal: number;
  trades: number;
  holders: number;
  change24h: number | null;
};

export type ProtocolActivity = {
  volumeTotal: number;
  volume24h: number;
  trades: number;
  trades24h: number;
  /** Tokens dont les journaux ont été relus. Dit sur quoi porte la somme. */
  pools: number;
  /**
   * Le détail par token. La liste des lancements s'en sert pour classer par
   * volume et afficher une variation, en un appel plutôt qu'un par carte.
   */
  tokens: TokenActivity[];
};

/**
 * Le total du launchpad.
 *
 * Les détenteurs ne sont volontairement pas sommés : une même personne peut
 * tenir dix tokens, et additionner les comptes par token la compterait dix
 * fois — un « nombre d'utilisateurs » gonflé, du genre qu'on retire plutôt que
 * d'expliquer.
 */
export async function protocolActivity(): Promise<ProtocolActivity> {
  const launches = await cachedLaunches();

  const perPool = await mapLimit(launches, CONCURRENCY, async (launch) => {
    try {
      return { launch, activity: await activityOf(launch.address) };
    } catch {
      // Un pool illisible ne doit pas annuler le total des autres.
      return null;
    }
  });

  const read = perPool.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    volumeTotal: read.reduce((sum, { activity }) => sum + activity.volumeTotal, 0),
    volume24h: read.reduce((sum, { activity }) => sum + activity.volume24h, 0),
    trades: read.reduce((sum, { activity }) => sum + activity.trades, 0),
    trades24h: read.reduce((sum, { activity }) => sum + activity.trades24h, 0),
    pools: read.length,
    tokens: read.map(({ launch, activity }) => ({
      address: launch.address.toLowerCase(),
      volume24h: activity.volume24h,
      volumeTotal: activity.volumeTotal,
      trades: activity.trades,
      holders: activity.holders,
      change24h: activity.change24h,
    })),
  };
}
