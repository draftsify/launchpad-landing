import { formatUsd } from "@/lib/format";

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
  /** Variation sur 24 h, ou depuis le lancement si le token est plus jeune. */
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
  supply: string;
  links: { website?: string; x?: string; telegram?: string };
  rules: TokenRules;
  /** Source du graphe : la série est dépliée à l'affichage. */
  chart: ChartSource;
};

/**
 * Description compacte d'une courbe. On ne transporte pas mille points dans
 * la charge de page : seuls les jalons voyagent, la série fine est reconstruite
 * à l'affichage — c'est elle qui permet une fenêtre d'une heure.
 */
export type ChartSource = {
  /** Premier point, ISO UTC. */
  start: string;
  /** Minutes entre deux points de la série fine. */
  stepMinutes: number;
  /** Points générés entre deux jalons. */
  perControl: number;
  /** Jalons, en milliers de dollars. */
  controls: number[];
  /** Décale le bruit : deux tokens ne doivent pas trembler à l'unisson. */
  seed: number;
};

/** Générateur déterministe : la courbe doit être identique à chaque rendu. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeries(source: ChartSource): SeriesPoint[] {
  const { start, stepMinutes, perControl, controls } = source;
  const rand = mulberry32(source.seed);
  const t0 = new Date(start).getTime();
  const last = (controls.length - 1) * perControl;

  const out: SeriesPoint[] = [];
  let noise = 0;

  for (let i = 0; i <= last; i++) {
    const seg = Math.min(Math.floor(i / perControl), controls.length - 2);
    const f = (i - seg * perControl) / perControl;
    const base = controls[seg] + (controls[seg + 1] - controls[seg]) * f;

    // Marche amortie plutôt que bruit blanc : les écarts persistent un peu,
    // ce qui donne des paliers au lieu d'un tremblement régulier. Le bruit
    // court sur toute la série, y compris la dernière heure — c'est la
    // fenêtre la plus regardée, elle ne doit pas être la plus lisse.
    noise = noise * 0.93 + (rand() - 0.5) * base * 0.012;

    out.push({
      t: new Date(t0 + i * stepMinutes * 60_000).toISOString(),
      value: Math.round((base + noise) * 1_000),
    });
  }

  return out;
}

/**
 * Présent figé du jeu de démonstration. Toutes les courbes s'y terminent, donc
 * les âges et les variations se comparent entre tokens.
 */
const NOW = Date.parse("2026-07-29T10:00:00Z");
const STEP_MINUTES = 5;

function ageLabel(ms: number) {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const rest = hours % 24;
  return rest ? `${Math.floor(hours / 24)}d ${rest}h` : `${hours / 24}d`;
}

type TokenSeed = Omit<
  Token,
  "marketCap" | "marketCapValue" | "change" | "age" | "launchedAt" | "chart"
> & {
  /** Heures entre deux jalons : fixe la durée de vie du token. */
  hoursPerControl: number;
  controls: number[];
  seed: number;
};

/**
 * Capitalisation, variation et âge sont lus dans la courbe, jamais recopiés
 * à côté : c'est la seule façon qu'une carte et sa fiche ne divergent pas.
 */
function makeToken({ hoursPerControl, controls, seed, ...rest }: TokenSeed): Token {
  const spanMs = (controls.length - 1) * hoursPerControl * 3_600_000;
  const chart: ChartSource = {
    start: new Date(NOW - spanMs).toISOString(),
    stepMinutes: STEP_MINUTES,
    perControl: (hoursPerControl * 60) / STEP_MINUTES,
    controls,
    seed,
  };

  const series = buildSeries(chart);
  const latest = series[series.length - 1].value;
  // Un token de huit heures n'a pas de « 24 h » : on remonte à son lancement.
  const back = Math.min((24 * 60) / STEP_MINUTES, series.length - 1);
  const then = series[series.length - 1 - back].value;

  return {
    ...rest,
    chart,
    marketCap: formatUsd(latest),
    marketCapValue: latest,
    change: ((latest - then) / then) * 100,
    age: ageLabel(spanMs),
    launchedAt: NOW - spanMs,
  };
}

// Données mock : aucun indexeur n'est branché à ce stade.
export const TOKENS: Token[] = [
  makeToken({
    slug: "reveal",
    name: "Reveal",
    ticker: "REVEAL",
    address: "0x7A3F9c21E4b8D5a06fC1e7B2d93aC48e5F0b1d62",
    holders: "1,284",
    locked: 34,
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
    // 43 intervalles de 2 h : 3 j 14 h.
    hoursPerControl: 2,
    seed: 0x5eaf,
    controls: [
      340, 368, 352, 401, 389, 432, 470, 452, 498, 540, 521, 575, 612, 594, 648,
      690, 668, 715, 762, 740, 690, 728, 775, 812, 786, 758, 802, 830, 795, 768,
      812, 840, 902, 875, 948, 1010, 1085, 1152, 1218, 1190, 1265, 1310, 1248,
      1200,
    ],
  }),

  makeToken({
    slug: "basalt",
    name: "Basalt",
    ticker: "BSLT",
    address: "0x2E81b0Ff45cA9d7361aB2e0c85D4f39a7C6b1E03",
    holders: "216",
    locked: 92,
    description:
      "Launched this morning with the tightest caps the protocol allows. Nothing to judge yet beyond how it behaves under its own rules.",
    liquidity: "4 ETH",
    supply: "1,000,000,000",
    links: { x: "basaltonchain" },
    rules: {
      initialUnlock: 5,
      unlockHours: 24,
      impactCap: 0.5,
      impactWindow: 5,
      launchDelay: 60,
    },
    // 16 intervalles de 30 min : 8 h.
    hoursPerControl: 0.5,
    seed: 0x1c4d,
    controls: [
      14, 19, 17, 24, 31, 27, 35, 42, 38, 46, 52, 48, 55, 51, 58, 62, 44,
    ],
  }),

  makeToken({
    slug: "halcyon",
    name: "Halcyon",
    ticker: "HLCN",
    address: "0x9Ba4C7e1D8f206aE35b9c04F7d1a8E62B0c3d95F",
    holders: "742",
    locked: 79,
    description:
      "Ran up fivefold in its first eight hours, then gave it all back. The unlock curve metered the exit; it did not prevent it.",
    liquidity: "4 ETH",
    supply: "500,000,000",
    links: { website: "halcyon.fyi", x: "halcyonproto" },
    rules: {
      initialUnlock: 5,
      unlockHours: 48,
      impactCap: 0.5,
      impactWindow: 5,
      launchDelay: 60,
    },
    // 16 intervalles de 2 h : 32 h.
    hoursPerControl: 2,
    seed: 0x77a1,
    controls: [
      64, 88, 142, 186, 164, 208, 172, 148, 132, 156, 138, 118, 124, 108, 112,
      102, 96,
    ],
  }),

  makeToken({
    slug: "northwind",
    name: "Northwind",
    ticker: "NRTH",
    address: "0x5D07f9A3c14B8e26D0a5F73b91C4e8025Ad6B7f1",
    holders: "3,051",
    locked: 46,
    trending: true,
    description:
      "Three days of steady accumulation with no single window ever hitting the impact cap — the pattern the protocol is built to make visible.",
    liquidity: "4 ETH",
    supply: "1,000,000,000",
    links: { website: "northwind.trade", x: "northwind", telegram: "northwind" },
    rules: {
      initialUnlock: 10,
      unlockHours: 24,
      impactCap: 1,
      impactWindow: 5,
      launchDelay: 30,
    },
    // 34 intervalles de 2 h : 2 j 20 h.
    hoursPerControl: 2,
    seed: 0x3f0b,
    controls: [
      28, 34, 31, 42, 55, 48, 62, 71, 66, 78, 92, 85, 101, 96, 112, 128, 119,
      138, 152, 144, 161, 178, 168, 189, 205, 196, 218, 234, 226, 251, 268, 258,
      284, 301, 318,
    ],
  }),

  makeToken({
    slug: "cadence",
    name: "Cadence",
    ticker: "CDNC",
    address: "0xC13e6b90F7a24D85c0B1f6e39A72d4508Ec9b3A6",
    holders: "1,908",
    locked: 41,
    description:
      "A slow release: 72 hours to full unlock, half-percent caps. Six days in, the curve has never gapped.",
    liquidity: "4 ETH",
    supply: "250,000,000",
    links: { website: "cadence.markets", x: "cadencemkt" },
    rules: {
      initialUnlock: 5,
      unlockHours: 72,
      impactCap: 0.5,
      impactWindow: 5,
      launchDelay: 60,
    },
    // 24 intervalles de 6 h : 6 j.
    hoursPerControl: 6,
    seed: 0x8d22,
    controls: [
      120, 138, 129, 165, 198, 182, 224, 261, 243, 288, 330, 312, 368, 402, 385,
      441, 478, 462, 515, 560, 604, 641, 690, 735, 780,
    ],
  }),

  makeToken({
    slug: "quarry",
    name: "Quarry",
    ticker: "QRRY",
    address: "0x4F8a2D63c05B91e7A6d380f4C2b95E71De08a3C9",
    holders: "5,427",
    locked: 18,
    description:
      "The oldest launch on the protocol. Almost every position is fully unlocked, so what you see now is an ordinary market.",
    liquidity: "4 ETH",
    supply: "1,000,000,000",
    links: { website: "quarry.exchange", x: "quarryprotocol" },
    rules: {
      initialUnlock: 25,
      unlockHours: 12,
      impactCap: 2,
      impactWindow: 5,
      launchDelay: 15,
    },
    // 20 intervalles de 11 h : 9 j 4 h.
    hoursPerControl: 11,
    seed: 0xb6e4,
    controls: [
      480, 545, 610, 588, 672, 745, 812, 790, 878, 940, 1015, 1088, 1160, 1124,
      1205, 1258, 1190, 1142, 1098, 1075, 1050,
    ],
  }),
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
