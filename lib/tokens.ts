export type SeriesPoint = { t: string; value: number };

export type TokenRules = {
  initialUnlock: number;
  unlockHours: number;
  impactCap: number;
  impactWindow: number;
  launchDelay: number;
};

export type Token = {
  /** Segment d'URL : /token/<slug>. */
  slug: string;
  name: string;
  ticker: string;
  marketCap: string;
  /** Valeur brute, pour animer le défilement du chiffre. */
  marketCapValue: number;
  change: number;
  address: string;
  age: string;
  holders: string;
  /** Part de la supply encore sous déblocage progressif. */
  locked: number;
  logo: string;
  trending?: boolean;
  description: string;
  liquidity: string;
  supply: string;
  links: { website?: string; x?: string; telegram?: string };
  rules: TokenRules;
  /** Capitalisation depuis le lancement, pas régulier. */
  series: SeriesPoint[];
  /** Repère du graphe : la capitalisation au premier bloc. */
  launchMarketCap: number;
};

/**
 * Étend une suite de valeurs sur un pas régulier. Évite d'écrire quarante
 * horodatages à la main, et garantit qu'ils restent alignés sur l'âge affiché.
 */
function series(startISO: string, stepMinutes: number, values: number[]): SeriesPoint[] {
  const start = new Date(startISO).getTime();
  return values.map((value, i) => ({
    t: new Date(start + i * stepMinutes * 60_000).toISOString(),
    value: value * 1_000,
  }));
}

// Lancement Jul 25 20:00 UTC, un point toutes les 2 h : 43 pas = 3 j 14 h,
// ce que la fiche annonce comme âge. Le point à −24 h vaut 840K, ce qui
// redonne exactement la variation de +42,8 % affichée ailleurs.
const REVEAL_SERIES = series("2026-07-25T20:00:00Z", 120, [
  340, 368, 352, 401, 389, 432, 470, 452, 498, 540, 521, 575, 612, 594, 648,
  690, 668, 715, 762, 740, 690, 728, 775, 812, 786, 758, 802, 830, 795, 768,
  812, 840, 902, 875, 948, 1010, 1085, 1152, 1218, 1190, 1265, 1310, 1248,
  1200,
]);

// Données mock : aucun indexeur n'est branché à ce stade.
export const TOKENS: Token[] = [
  {
    slug: "reveal",
    name: "Reveal",
    ticker: "REVEAL",
    marketCap: "$1.2M",
    marketCapValue: 1_200_000,
    change: 42.8,
    address: "0x7A3F9c21E4b8D5a06fC1e7B2d93aC48e5F0b1d62",
    age: "3d 14h",
    holders: "1,284",
    locked: 62,
    logo: "/logo.png",
    trending: true,
    description:
      "The protocol token. Launched under the same rules every other token on Reveal gets — no exemption, no reserved allocation that unlocks faster.",
    liquidity: "4 ETH",
    supply: "1,000,000,000",
    links: { website: "reveal.xyz", x: "reveal", telegram: "reveal" },
    rules: {
      initialUnlock: 10,
      unlockHours: 24,
      impactCap: 1,
      impactWindow: 5,
      launchDelay: 30,
    },
    series: REVEAL_SERIES,
    launchMarketCap: 340_000,
  },
];

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
