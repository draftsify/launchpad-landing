export { formatUsd, formatCount } from "@/lib/format";

export type DailyPoint = { date: string; value: number };

export type Range = "24h" | "all";

/**
 * Données d'exemple : aucun indexeur n'est branché. Les ordres de grandeur
 * restent volontairement modestes, cohérents avec un protocole qui démarre.
 */
const VOLUME: DailyPoint[] = [
  { date: "Jul 15", value: 182_000 },
  { date: "Jul 16", value: 143_000 },
  { date: "Jul 17", value: 96_000 },
  { date: "Jul 18", value: 121_000 },
  { date: "Jul 19", value: 134_000 },
  { date: "Jul 20", value: 228_000 },
  { date: "Jul 21", value: 341_000 },
  { date: "Jul 22", value: 297_000 },
  { date: "Jul 23", value: 312_000 },
  { date: "Jul 24", value: 254_000 },
  { date: "Jul 25", value: 209_000 },
  { date: "Jul 26", value: 276_000 },
  { date: "Jul 27", value: 243_000 },
  { date: "Jul 28", value: 318_000 },
];

const LAUNCHES: DailyPoint[] = [
  { date: "Jul 15", value: 6 },
  { date: "Jul 16", value: 4 },
  { date: "Jul 17", value: 3 },
  { date: "Jul 18", value: 5 },
  { date: "Jul 19", value: 4 },
  { date: "Jul 20", value: 9 },
  { date: "Jul 21", value: 14 },
  { date: "Jul 22", value: 11 },
  { date: "Jul 23", value: 8 },
  { date: "Jul 24", value: 7 },
  { date: "Jul 25", value: 6 },
  { date: "Jul 26", value: 10 },
  { date: "Jul 27", value: 9 },
  { date: "Jul 28", value: 12 },
];

export const SERIES = { volume: VOLUME, launches: LAUNCHES };

function sum(points: DailyPoint[]) {
  return points.reduce((acc, p) => acc + p.value, 0);
}

function delta(points: DailyPoint[]) {
  const last = points[points.length - 1].value;
  const prev = points[points.length - 2].value;
  return ((last - prev) / prev) * 100;
}


export type Stat = {
  label: string;
  /** Valeur brute : le défilement à l'apparition anime le nombre, pas le texte. */
  value: number;
  kind: "usd" | "count";
  delta?: string;
  hint: string;
};

function signed(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

export function getStats(range: Range): Stat[] {
  if (range === "24h") {
    return [
      {
        label: "24h volume",
        value: VOLUME[VOLUME.length - 1].value,
        kind: "usd",
        delta: signed(delta(VOLUME)),
        hint: "from prior day",
      },
      {
        label: "24h launches",
        value: LAUNCHES[LAUNCHES.length - 1].value,
        kind: "count",
        delta: signed(delta(LAUNCHES)),
        hint: "from prior day",
      },
      {
        label: "24h trades",
        value: 1_412,
        kind: "count",
        delta: "+6.2%",
        hint: "from prior day",
      },
    ];
  }

  return [
    {
      label: "Total volume",
      value: sum(VOLUME),
      kind: "usd",
      hint: "since first launch",
    },
    {
      label: "Tokens deployed",
      value: sum(LAUNCHES),
      kind: "count",
      hint: "since first launch",
    },
    {
      label: "Total trades",
      value: 18_640,
      kind: "count",
      hint: "since first launch",
    },
  ];
}
