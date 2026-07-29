import type { DailyPoint } from "@/lib/analytics";

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
  volume: DailyPoint[];
};

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
    volume: [
      { date: "Jul 22", value: 84_000 },
      { date: "Jul 23", value: 112_000 },
      { date: "Jul 24", value: 96_000 },
      { date: "Jul 25", value: 143_000 },
      { date: "Jul 26", value: 128_000 },
      { date: "Jul 27", value: 167_000 },
      { date: "Jul 28", value: 194_000 },
    ],
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
