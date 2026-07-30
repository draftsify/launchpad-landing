import { formatCount, formatEth } from "@/lib/format";
import type { Launch } from "@/lib/onchain";

export type DailyPoint = { date: string; value: number };

export type Stat = {
  label: string;
  value: number;
  format: (value: number) => string;
  hint: string;
};

const DAY_MS = 86_400_000;

/**
 * Le jour UTC d'un horodatage, et son étiquette.
 *
 * UTC et non l'heure locale : le regroupement doit donner le même graphique
 * quel que soit le fuseau du lecteur, sans quoi deux personnes voient deux
 * histoires du même registre.
 */
function dayStart(ms: number) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function dayLabel(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Ce qu'un nœud peut réellement dire de l'ensemble du launchpad.
 *
 * Les deux premiers chiffres sont au présent : ils décrivent l'état actuel des
 * pools, lu maintenant. Le troisième est de l'histoire, mais une histoire que
 * la chaîne rend sans indexeur — le registre garde la date de lancement de
 * chaque token, donc les compter par âge ne demande rien d'autre.
 *
 * Le volume et le nombre de trades n'y sont pas : ils supposent de rejouer les
 * swaps du pool. Afficher zéro à leur place les ferait passer pour mesurés.
 */
export function statsFrom(launches: Launch[], now: number): Stat[] {
  const since = now / 1000 - 86_400;

  return [
    {
      label: "Liquidity in pools",
      value: launches.reduce((sum, l) => sum + l.liquidityEth, 0),
      format: formatEth,
      hint: "quote held by every Reveal pool right now",
    },
    {
      label: "Combined market cap",
      value: launches.reduce((sum, l) => sum + l.marketCapEth, 0),
      format: formatEth,
      hint: "supply at the current tick, every token",
    },
    {
      label: "Tokens deployed",
      value: launches.length,
      format: formatCount,
      hint:
        launches.filter((l) => l.launchedAt >= since).length +
        " in the last 24 hours",
    },
  ];
}

/**
 * Lancements par jour, sur une fenêtre glissante.
 *
 * Les jours sans lancement comptent pour zéro et restent tracés : les retirer
 * comprimerait le temps et ferait lire un mois calme comme une semaine active.
 */
export function dailyLaunches(
  launches: Launch[],
  now: number,
  days = 14
): DailyPoint[] {
  const today = dayStart(now);
  const buckets = new Map<number, number>();

  for (let i = days - 1; i >= 0; i--) buckets.set(today - i * DAY_MS, 0);

  for (const launch of launches) {
    const day = dayStart(launch.launchedAt * 1000);
    const current = buckets.get(day);
    if (current !== undefined) buckets.set(day, current + 1);
  }

  return [...buckets].map(([ms, value]) => ({ date: dayLabel(ms), value }));
}
