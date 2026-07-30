import type { Launch } from "@/lib/onchain";

export type { Launch };

export function matchesQuery(launch: Launch, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    launch.name.toLowerCase().includes(q) ||
    launch.symbol.toLowerCase().includes(q) ||
    launch.address.toLowerCase().includes(q)
  );
}

export type SortId = "recent" | "marketCap" | "liquidity";

/**
 * Trois tris, et pas six.
 *
 * « Trending » classait par variation sur 24 h et « Nearly unlocked » par part
 * de supply encore bloquée. Aucun des deux n'est calculable en lisant la
 * chaîne : le premier demande le prix d'hier, le second l'état de toutes les
 * positions. Ils fonctionnaient sur les tokens fictifs. Les garder aurait
 * voulu dire soit un onglet qui ne trie rien, soit inventer le critère.
 */
export const SORTS: { id: SortId; label: string; hint: string }[] = [
  { id: "recent", label: "Recent", hint: "Newest launch first" },
  { id: "marketCap", label: "Market cap", hint: "Largest first" },
  { id: "liquidity", label: "Liquidity", hint: "Deepest pool first" },
];

const COMPARE: Record<SortId, (a: Launch, b: Launch) => number> = {
  recent: (a, b) => b.launchedAt - a.launchedAt,
  marketCap: (a, b) => b.marketCapEth - a.marketCapEth,
  liquidity: (a, b) => b.liquidityEth - a.liquidityEth,
};

export function sortLaunches(launches: Launch[], sort: SortId) {
  return [...launches].sort(COMPARE[sort]);
}
