export type Token = {
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
};

// Données mock : aucun indexeur n'est branché à ce stade.
export const TOKENS: Token[] = [
  {
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
  },
];

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
