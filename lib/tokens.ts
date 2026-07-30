/**
 * Aucune règle n'est portée par le token : elles sont identiques pour tout
 * lancement et vivent dans `lib/presets`. Les recopier ici laisserait croire
 * qu'un token peut en avoir d'autres.
 */
export type Token = {
  /** Segment d'URL : /token/<slug>. */
  slug: string;
  name: string;
  ticker: string;
  marketCap: string;
  marketCapValue: number;
  /** Variation sur 24 h. */
  change: number;
  address: string;
  age: string;
  /** Horodatage du lancement, en ms : c'est lui qui trie « Recent ». */
  launchedAt: number;
  holders: string;
  /** Part de la supply encore sous déblocage progressif. */
  locked: number;
  /** Absent : la fiche retombe sur un monogramme. */
  logo?: string;
  trending?: boolean;
  description: string;
  liquidity: string;
  links: { website?: string; x?: string; telegram?: string };
};

/**
 * Aucun token n'existe tant que le launcher n'est pas déployé et qu'aucun
 * lancement n'a eu lieu.
 *
 * Cette liste reste vide volontairement. Elle a contenu des exemples pendant la
 * construction de l'interface ; les garder aurait présenté des capitalisations,
 * des variations et des nombres de détenteurs inventés comme si c'était le
 * marché. La remplir demande de lire la chaîne — la liste des tokens et leurs
 * métadonnées viennent du launcher, l'historique de prix d'un indexeur qui
 * n'existe pas encore.
 */
export const TOKENS: Token[] = [];

export function getToken(slug: string) {
  return TOKENS.find((t) => t.slug === slug);
}

export function searchTokens(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return TOKENS;
  return TOKENS.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.ticker.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
  );
}

export type SortId = "recent" | "trending" | "marketCap" | "unlocked";

export const SORTS: { id: SortId; label: string; hint: string }[] = [
  { id: "recent", label: "Recent", hint: "Newest launch first" },
  { id: "trending", label: "Trending", hint: "Biggest 24h move first" },
  { id: "marketCap", label: "Market cap", hint: "Largest first" },
  {
    id: "unlocked",
    label: "Nearly unlocked",
    hint: "Least supply left to vest first",
  },
];

const COMPARE: Record<SortId, (a: Token, b: Token) => number> = {
  recent: (a, b) => b.launchedAt - a.launchedAt,
  trending: (a, b) => b.change - a.change,
  marketCap: (a, b) => b.marketCapValue - a.marketCapValue,
  unlocked: (a, b) => a.locked - b.locked,
};

export function sortTokens(tokens: Token[], sort: SortId) {
  return [...tokens].sort(COMPARE[sort]);
}
