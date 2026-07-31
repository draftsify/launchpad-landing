import { parseAbi } from "viem";

import { activeChain, publicClient } from "@/lib/chain";

/**
 * Le déploiement Uniswap V3 auquel nos pools appartiennent.
 *
 * Ces adresses ne sont pas interchangeables. Robinhood Chain porte une douzaine
 * de SwapRouter et une trentaine de QuoterV2, chacun branché sur une factory
 * différente : un routeur dont `factory()` n'est pas la nôtre ne verra jamais
 * nos pools et renverra « pool inexistant ». Celles-ci ont été retenues parce
 * que leur `factory()` rend exactement la factory que le launcher utilise, et
 * leur `WETH9()` le WETH que le launcher prend pour quote.
 *
 *   cast call <router> 'factory()(address)' --rpc-url robinhood
 */
const DEPLOYMENTS: Record<number, { router: `0x${string}`; quoter: `0x${string}` }> = {
  4663: {
    router: "0xCaf681a66D020601342297493863E78C959E5cb2",
    quoter: "0x962dd0B5012982bB8b4dfe7050c0d46333Dd16CF",
  },
};

/** Palier de frais du pool, identique à celui que le launcher crée. */
export const POOL_FEE = 10_000;

export const uniswap = DEPLOYMENTS[activeChain.id] ?? null;

export const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
  "function liquidity() view returns (uint128)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export const routerAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
]);

export const quoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

/**
 * Combien de tokens (ou de quote) une entrée donnée rendrait, au prix courant.
 *
 * Le quoter *simule* le swap, donc il traverse nos gardes comme le ferait la
 * vraie transaction : pendant le délai anti-sniper, au-dessus de la rampe
 * d'achat, ou pour une vente supérieure au débloqué, il revert. Et comme
 * Uniswap remplace nos motifs par « TF », l'échec ne dit pas lequel — d'où
 * `null` plutôt qu'une erreur : c'est à l'appelant, qui a déjà lu `releasable`
 * et `launchedAt`, de dire pourquoi.
 */
export async function quote(
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint
): Promise<bigint | null> {
  if (!uniswap || amountIn <= 0n) return null;
  try {
    const { result } = await publicClient.simulateContract({
      address: uniswap.quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        { tokenIn, tokenOut, amountIn, fee: POOL_FEE, sqrtPriceLimitX96: 0n },
      ],
    });
    return result[0];
  } catch {
    return null;
  }
}

/**
 * Prix du token en quote, lu au tick courant du pool.
 *
 * `sqrtPriceX96` est la racine du prix de token1 en token0, à 2^96 près. Le
 * carré déborde un uint256 en Solidity mais pas en JavaScript, où les entiers
 * arbitraires n'ont pas de plafond — on peut donc calculer directement, en
 * gardant douze décimales de précision avant de repasser en nombre flottant.
 */
export function priceFromSqrt(sqrtPriceX96: bigint, tokenIsToken0: boolean) {
  const Q96 = 1n << 96n;
  const SCALE = 10n ** 12n;
  // (sqrt/2^96)^2, mis à l'échelle pour survivre à la division entière.
  const ratio = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96);
  if (ratio === 0n) return 0;
  const asNumber = Number(ratio) / Number(SCALE);
  // token0 : le prix rendu est « quote par token ». token1 : c'est l'inverse.
  return tokenIsToken0 ? asNumber : 1 / asNumber;
}

/**
 * Racine du prix d'ouverture d'un lancement, à 2^96 près, vue depuis « notre
 * token est token0 ».
 *
 * Relevée sur `TickMath.getSqrtRatioAtTick(-204200)` — la bibliothèque
 * embarquée dans les contrats, pas une table recopiée d'ailleurs. Le tick de
 * départ est une constante du launcher, donc cette valeur ne bouge pas tant que
 * la courbe ne bouge pas.
 */
const LAUNCH_SQRT_X96 = 2_917_122_157_712_197_017_744_680n;

/** Liquidité posée par un milliard de tokens sur la plage. */
const LAUNCH_LIQUIDITY = 36_819_258_015_569_838_458_222n;

/**
 * Ce qu'un achat de `quoteIn` wei rapporte au tout premier instant d'un
 * lancement, en wei de token.
 *
 * Calculé plutôt que demandé à un Quoter : le token n'existe pas encore quand
 * l'interface doit afficher ce nombre. La position est d'un seul tenant et le
 * prix part de son bord, donc un seul pas suffit — pas de traversée de tick à
 * simuler.
 *
 * L'orientation ne change rien : la courbe est symétrique par construction, et
 * c'est précisément ce que les tests de parité vérifient. On calcule donc dans
 * le sens « token = token0 » quel que soit celui que l'adresse donnera.
 *
 * Vérifiée contre un vrai swap sur un fork de la chaîne : 14 395 208 contre
 * 14 395 207 tokens pour 0,02 ETH, soit un wei d'écart — l'arrondi entier
 * d'Uniswap, et il va dans le sens prudent. Reste que c'est une estimation, et
 * que le prix aura pu bouger entre l'affichage et l'inclusion : la garantie que
 * la transaction passera vient de la simulation faite avant signature, pas
 * d'ici.
 */
export function estimateCreatorBuy(quoteIn: bigint) {
  if (quoteIn <= 0n) return 0n;

  const Q96 = 1n << 96n;
  // Uniswap prélève ses frais sur l'entrée, avant que le prix ne bouge.
  const afterFee = (quoteIn * BigInt(1_000_000 - POOL_FEE)) / 1_000_000n;

  const s0 = LAUNCH_SQRT_X96;
  const s1 = s0 + (afterFee * Q96) / LAUNCH_LIQUIDITY;
  if (s1 <= s0) return 0n;

  return (LAUNCH_LIQUIDITY * Q96 * (s1 - s0)) / (s0 * s1);
}

/**
 * L'inverse : le plus gros achat, en wei de quote, qui reste sous `cap` tokens.
 *
 * L'interface en a besoin pour borner le champ plutôt que pour rattraper une
 * erreur. Un plafond découvert au moment de signer est un plafond mal annoncé —
 * et ici l'échec ferait échouer le lancement entier, pas seulement l'achat.
 */
export function maxCreatorBuyQuote(cap: bigint) {
  if (cap <= 0n) return 0n;

  const Q96 = 1n << 96n;
  const s0 = LAUNCH_SQRT_X96;
  const num = LAUNCH_LIQUIDITY * Q96;
  const den = num - cap * s0;
  // Un plafond assez large pour vider la plage n'a plus de borne utile.
  if (den <= 0n) return 0n;

  const s1 = (num * s0) / den;
  const afterFee = ((s1 - s0) * LAUNCH_LIQUIDITY) / Q96;
  // On repasse la commission à l'envers, en arrondissant vers le bas : viser le
  // plafond au wei près donnerait une transaction qui échoue une fois sur deux.
  return (afterFee * 1_000_000n) / BigInt(1_000_000 - POOL_FEE);
}
