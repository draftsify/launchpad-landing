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

const NOISE_SEED = 0x5eaf;

export function buildSeries(source: ChartSource): SeriesPoint[] {
  const { start, stepMinutes, perControl, controls } = source;
  const rand = mulberry32(NOISE_SEED);
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

// Lancement Jul 25 20:00 UTC, jalons toutes les 2 h : 43 pas = 3 j 14 h,
// soit l'âge affiché sur la fiche.
const REVEAL_CHART: ChartSource = {
  start: "2026-07-25T20:00:00Z",
  stepMinutes: 5,
  perControl: 24,
  controls: [
    340, 368, 352, 401, 389, 432, 470, 452, 498, 540, 521, 575, 612, 594, 648,
    690, 668, 715, 762, 740, 690, 728, 775, 812, 786, 758, 802, 830, 795, 768,
    812, 840, 902, 875, 948, 1010, 1085, 1152, 1218, 1190, 1265, 1310, 1248,
    1200,
  ],
};

const REVEAL_SERIES = buildSeries(REVEAL_CHART);

function latest(series: SeriesPoint[]) {
  return series[series.length - 1].value;
}

/** Variation sur une fenêtre, lue dans la série et non saisie à la main. */
function changeOver(series: SeriesPoint[], hours: number, stepMinutes: number) {
  const back = (hours * 60) / stepMinutes;
  const then = series[Math.max(0, series.length - 1 - back)].value;
  return ((latest(series) - then) / then) * 100;
}

// Données mock : aucun indexeur n'est branché à ce stade. Les chiffres de
// capitalisation sont lus dans la courbe plutôt que recopiés : c'est la seule
// façon qu'ils ne dérivent pas de ce que le graphe montre.
export const TOKENS: Token[] = [
  {
    slug: "reveal",
    name: "Reveal",
    ticker: "REVEAL",
    marketCap: formatUsd(latest(REVEAL_SERIES)),
    marketCapValue: latest(REVEAL_SERIES),
    change: changeOver(REVEAL_SERIES, 24, REVEAL_CHART.stepMinutes),
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
    chart: REVEAL_CHART,
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
