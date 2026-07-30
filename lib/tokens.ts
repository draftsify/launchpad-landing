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

export type SortId = "recent" | "volume" | "marketCap" | "liquidity";

/**
 * Quatre tris, tous calculables.
 *
 * « Nearly unlocked » reste absent : classer par part de supply encore bloquée
 * demanderait l'état de toutes les positions ouvertes, que ni la chaîne ni les
 * journaux ne donnent sans énumérer les détenteurs. « Volume » est revenu le
 * jour où les journaux ont été relus — avant, il aurait fallu l'inventer.
 */
export const SORTS: { id: SortId; label: string; hint: string }[] = [
  { id: "recent", label: "Recent", hint: "Newest launch first" },
  { id: "volume", label: "24h volume", hint: "Most traded in the last day" },
  { id: "marketCap", label: "Market cap", hint: "Largest first" },
  { id: "liquidity", label: "Liquidity", hint: "Deepest pool first" },
];

/** Volume échangé sur 24 h, par adresse. Zéro quand l'historique n'est pas lu. */
export type VolumeLookup = (launch: Launch) => number;

const COMPARE: Record<SortId, (a: Launch, b: Launch, volume: VolumeLookup) => number> = {
  recent: (a, b) => b.launchedAt - a.launchedAt,
  // À volume égal — deux tokens sans échange, par exemple — le plus récent
  // passe devant, plutôt qu'un ordre arbitraire hérité du registre.
  volume: (a, b, volume) => volume(b) - volume(a) || b.launchedAt - a.launchedAt,
  marketCap: (a, b) => b.marketCapEth - a.marketCapEth,
  liquidity: (a, b) => b.liquidityEth - a.liquidityEth,
};

export function sortLaunches(
  launches: Launch[],
  sort: SortId,
  volume: VolumeLookup = () => 0
) {
  return [...launches].sort((a, b) => COMPARE[sort](a, b, volume));
}
