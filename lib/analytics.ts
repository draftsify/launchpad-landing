export { formatUsd, formatCount } from "@/lib/format";

export type DailyPoint = { date: string; value: number };

export type Range = "24h" | "all";

export type Stat = {
  label: string;
  value: number;
  kind: "usd" | "count";
  delta?: string;
  hint: string;
};

/**
 * Rien à afficher tant qu'aucun lancement n'a eu lieu.
 *
 * Ce fichier a porté des séries d'exemple pendant la construction des
 * graphiques. Les garder revenait à publier un volume et un nombre de
 * déploiements inventés sur une page intitulée « Analytics » — la lecture la
 * plus trompeuse possible, parce que c'est exactement là qu'on vient chercher
 * des faits.
 *
 * Les remplir demande un indexeur : un nœud donne l'état présent, pas le
 * volume d'hier ni le nombre de détenteurs.
 */
export const SERIES: { volume: DailyPoint[]; launches: DailyPoint[] } = {
  volume: [],
  launches: [],
};

export function getStats(range: Range): Stat[] {
  const since = range === "24h" ? "in the last 24 hours" : "since launch";
  return [
    { label: range === "24h" ? "24h volume" : "Total volume", value: 0, kind: "usd", hint: since },
    {
      label: range === "24h" ? "24h launches" : "Tokens deployed",
      value: 0,
      kind: "count",
      hint: since,
    },
    { label: range === "24h" ? "24h trades" : "Total trades", value: 0, kind: "count", hint: since },
  ];
}
