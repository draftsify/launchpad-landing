import { formatEther, parseAbiItem, type Log } from "viem";

import { LAUNCHER_ADDRESS, publicClient } from "@/lib/chain";
import { priceFromSqrt } from "@/lib/uniswap";

/**
 * L'indexeur.
 *
 * Un nœud rend l'état présent : le prix courant, un solde, une réserve. Tout ce
 * qui parle du passé — le volume échangé, le nombre de trades, la liste des
 * détenteurs, une variation sur 24 h — n'est pas un état mais une somme
 * d'événements. Il faut les relire.
 *
 * Ce fichier les relit. Pas de base de données, pas de service à faire tourner :
 * `eth_getLogs` filtré sur une seule adresse rend l'intégralité de l'historique
 * d'un pool en un appel. Mesuré sur Robinhood Chain, le pool le plus actif
 * trouvé compte 3 904 swaps depuis la genèse — le nœud plafonne à 10 000
 * résultats par requête, et découper la plage suffit à passer outre.
 *
 * Le coût est donc « une requête par pool », pas « une base à maintenir ». Ce
 * qui tient tant qu'un pool reste dans cet ordre de grandeur ; au-delà, c'est
 * le découpage ci-dessous qui absorbe, au prix de plusieurs appels.
 */

const SWAP = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
);

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const DAY_SECONDS = 86_400;
/** Points du graphique de prix. Assez pour une forme, assez peu pour 25 appels. */
const BUCKETS = 24;

export type PricePoint = { time: number; price: number };

export type Activity = {
  /** Quote échangée, entrées et sorties confondues. */
  volumeTotal: number;
  volume24h: number;
  trades: number;
  trades24h: number;
  /** Adresses au solde non nul, pool et zéro exclus. */
  holders: number;
  /** Variation du prix sur 24 h, en %. `null` s'il n'y a pas de point d'il y a 24 h. */
  change24h: number | null;
  series: PricePoint[];
};

/**
 * Le nœud refuse au-delà de 10 000 résultats. Plutôt que de deviner une taille
 * de fenêtre sûre — elle dépend de l'activité, qu'on ne connaît qu'après —, on
 * demande tout et on coupe en deux à chaque refus. Une plage calme reste un
 * appel ; seule une plage dense en coûte plusieurs.
 */
function tooManyLogs(error: unknown) {
  const text = String(error);
  return (
    text.includes("exceeds limit") ||
    text.includes("more than") ||
    text.includes("too many results") ||
    text.includes("query timeout")
  );
}

async function getLogsSplit<T extends Log>(
  fetchRange: (from: bigint, to: bigint) => Promise<T[]>,
  from: bigint,
  to: bigint
): Promise<T[]> {
  try {
    return await fetchRange(from, to);
  } catch (error) {
    if (!tooManyLogs(error) || to - from < 2n) throw error;
    const middle = from + (to - from) / 2n;
    const [left, right] = await Promise.all([
      getLogsSplit(fetchRange, from, middle),
      getLogsSplit(fetchRange, middle + 1n, to),
    ]);
    return [...left, ...right];
  }
}

/**
 * Le dernier bloc dont l'horodatage précède `timestamp`, par dichotomie.
 *
 * Il n'existe pas de « bloc à telle heure » interrogeable : seul le numéro est
 * indexé. Vingt-cinq lectures suffisent à trancher 23 millions de blocs, et le
 * résultat ne dépend d'aucun token — il est calculé une fois pour toute la page.
 */
export async function blockAtTime(timestamp: number, latest: bigint) {
  let low = 0n;
  let high = latest;

  while (low < high) {
    const middle = (low + high + 1n) / 2n;
    const block = await publicClient.getBlock({ blockNumber: middle });
    if (Number(block.timestamp) <= timestamp) low = middle;
    else high = middle - 1n;
  }
  return low;
}

/** Horodatages de plusieurs blocs, en parallèle. */
async function timestampsOf(blocks: bigint[]) {
  const found = await Promise.all(
    blocks.map((blockNumber) =>
      publicClient
        .getBlock({ blockNumber })
        .then((b) => Number(b.timestamp))
        .catch(() => null)
    )
  );
  return found;
}

type SwapLog = Log<bigint, number, false, typeof SWAP>;

/**
 * Tout ce qu'un pool a fait, relu depuis ses journaux.
 *
 * `tokenIsToken0` décide de quel côté lire : un swap rend deux montants signés,
 * et c'est celui de la quote qui mesure le volume. Le signe dit le sens, la
 * valeur absolue la taille — on somme les deux sens, comme tout le monde.
 */
export async function readActivity(params: {
  token: `0x${string}`;
  pool: `0x${string}`;
  tokenIsToken0: boolean;
}): Promise<Activity> {
  const { token, pool, tokenIsToken0 } = params;

  const latest = await publicClient.getBlockNumber();

  const swaps = await getLogsSplit<SwapLog>(
    (fromBlock, toBlock) =>
      publicClient.getLogs({ address: pool, event: SWAP, fromBlock, toBlock }),
    0n,
    latest
  );

  const empty: Activity = {
    volumeTotal: 0,
    volume24h: 0,
    trades: 0,
    trades24h: 0,
    holders: 0,
    change24h: null,
    series: [],
  };

  if (swaps.length === 0) return { ...empty, holders: await countHolders(token, pool, latest) };

  swaps.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : Number(a.blockNumber - b.blockNumber)
  );

  // « Il y a 24 h » se mesure sur l'horloge de la chaîne, pas sur celle du
  // serveur. Les deux s'accordent quand tout va bien ; quand elles divergent —
  // chaîne à l'arrêt, horloge de serveur décalée — c'est la chaîne qui fait foi,
  // puisque c'est elle qui date les swaps qu'on est en train de compter.
  const head = await publicClient.getBlock({ blockNumber: latest });
  const cutoffBlock = await blockAtTime(Number(head.timestamp) - DAY_SECONDS, latest);

  let volumeTotal = 0n;
  let volume24h = 0n;
  let trades24h = 0;

  for (const swap of swaps) {
    const { amount0, amount1 } = swap.args;
    if (amount0 === undefined || amount1 === undefined) continue;
    // Le montant de quote, quel que soit son côté. Négatif = sorti du pool.
    const quoteDelta = tokenIsToken0 ? amount1 : amount0;
    const size = quoteDelta < 0n ? -quoteDelta : quoteDelta;

    volumeTotal += size;
    if (swap.blockNumber >= cutoffBlock) {
      volume24h += size;
      trades24h++;
    }
  }

  const [series, holders] = await Promise.all([
    buildSeries(swaps, tokenIsToken0, latest),
    countHolders(token, pool, latest),
  ]);

  // Variation sur 24 h : le premier prix observé après la coupure, comparé au
  // dernier. Sans swap avant la coupure, il n'y a pas de « il y a 24 h » à
  // comparer — et inventer un point de départ inventerait la variation.
  const before = swaps.filter((s) => s.blockNumber < cutoffBlock);
  const priceOf = (swap: SwapLog) =>
    priceFromSqrt(swap.args.sqrtPriceX96 ?? 0n, tokenIsToken0);
  const last = priceOf(swaps[swaps.length - 1]);
  const reference = before.length > 0 ? priceOf(before[before.length - 1]) : null;

  return {
    volumeTotal: Number(formatEther(volumeTotal)),
    volume24h: Number(formatEther(volume24h)),
    trades: swaps.length,
    trades24h,
    holders,
    change24h:
      reference && reference > 0 ? ((last - reference) / reference) * 100 : null,
    series,
  };
}

/**
 * Le prix dans le temps, par tranches de blocs égales.
 *
 * Les swaps ne portent que des numéros de bloc ; seules les bornes des tranches
 * sont datées, ce qui coûte 24 lectures au lieu d'une par swap. Une tranche sans
 * swap garde le dernier prix connu — le prix ne disparaît pas faute d'échange.
 */
async function buildSeries(
  swaps: SwapLog[],
  tokenIsToken0: boolean,
  latest: bigint
): Promise<PricePoint[]> {
  const first = swaps[0].blockNumber;
  const span = latest - first;
  if (span <= 0n) return [];

  // Jamais plus de tranches que de blocs à répartir : un token qui vient de
  // naître les ferait toutes tomber sur le même bloc, et vingt-quatre points
  // identiques dessineraient une histoire là où il n'y a qu'un instant.
  const count = span < BigInt(BUCKETS) ? Number(span) : BUCKETS;

  const edges = Array.from(
    { length: count + 1 },
    (_, i) => first + (span * BigInt(i)) / BigInt(count)
  );
  const times = await timestampsOf(edges);

  const points: PricePoint[] = [];
  let cursor = 0;
  let price = priceFromSqrt(swaps[0].args.sqrtPriceX96 ?? 0n, tokenIsToken0);

  for (let i = 0; i < count; i++) {
    const end = edges[i + 1];
    while (cursor < swaps.length && swaps[cursor].blockNumber <= end) {
      price = priceFromSqrt(swaps[cursor].args.sqrtPriceX96 ?? 0n, tokenIsToken0);
      cursor++;
    }
    const time = times[i + 1];
    if (time === null) continue;
    // Deux bornes peuvent partager un horodatage quand les blocs s'enchaînent
    // plus vite que la seconde : on garde le prix le plus récent des deux.
    const previous = points[points.length - 1];
    if (previous && previous.time === time) previous.price = price;
    else points.push({ time, price });
  }

  return points;
}

/**
 * Les détenteurs, en rejouant les transferts.
 *
 * Un ERC-20 ne tient pas la liste de ses détenteurs : `balanceOf` répond pour
 * une adresse qu'on lui nomme, et il n'y a aucun moyen de les énumérer. Le seul
 * chemin est de repartir des `Transfer` et de refaire les soldes.
 *
 * Le pool est exclu — sa réserve n'est le portefeuille de personne — et l'adresse
 * zéro avec lui.
 */
async function countHolders(
  token: `0x${string}`,
  pool: `0x${string}`,
  latest: bigint
) {
  const transfers = await getLogsSplit(
    (fromBlock, toBlock) =>
      publicClient.getLogs({ address: token, event: TRANSFER, fromBlock, toBlock }),
    0n,
    latest
  );

  const balances = new Map<string, bigint>();
  const add = (who: string, delta: bigint) =>
    balances.set(who.toLowerCase(), (balances.get(who.toLowerCase()) ?? 0n) + delta);

  for (const transfer of transfers) {
    const { from, to, value } = transfer.args;
    if (from === undefined || to === undefined || value === undefined) continue;
    add(from, -value);
    add(to, value);
  }

  // Le pool n'est le portefeuille de personne, et le launcher garde une
  // poussière d'arrondi de chaque lancement : le compter ajouterait un
  // détenteur fictif à tous les tokens, toujours le même.
  const ignored = new Set([
    pool.toLowerCase(),
    LAUNCHER_ADDRESS.toLowerCase(),
    "0x0000000000000000000000000000000000000000",
  ]);

  let holders = 0;
  for (const [who, balance] of balances) {
    if (balance > 0n && !ignored.has(who)) holders++;
  }
  return holders;
}
