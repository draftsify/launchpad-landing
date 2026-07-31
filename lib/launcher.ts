import { decodeEventLog, parseAbi, type Hash, type TransactionReceipt } from "viem";

import { LAUNCHER_ADDRESS, publicClient } from "@/lib/chain";

/// Sous-ensemble de RevealLauncher dont l'interface a besoin.
export const launcherAbi = parseAbi([
  "function launch(string name, string symbol, string metadataURI) returns (address token, address pool)",
  // Le même lancement, suivi d'un achat payé par le créateur dans la même
  // transaction. `value` porte le montant : il n'y a pas de paramètre pour ça.
  "function launchWithBuy(string name, string symbol, string metadataURI) payable returns (address token, address pool)",
  "function creatorBuyCap() view returns (uint256)",
  "function quote() view returns (address)",
  "function tokenCount() view returns (uint256)",
  "function tokens(uint256) view returns (address)",
  "function supply() view returns (uint256)",
  "function rules() view returns (uint16 initialUnlockBps, uint32 unlockSeconds, uint32 launchDelay, uint32 buyRamp)",
  "function locker() view returns (address)",
  "function launches(address token) view returns (address pool, uint256 tokenId, uint128 liquidity, int24 tickLower, int24 tickUpper, address creator, uint64 launchedAt)",
  "event Launched(address indexed token, address indexed creator, address pool, uint256 tokenId, uint256 supply, uint128 liquidity, int24 tickLower, int24 tickUpper, (uint16,uint32,uint32,uint32) rules)",
  "event CreatorBought(address indexed token, address indexed creator, uint256 quoteIn, uint256 tokensOut)",
]);

/**
 * Le locker : propriétaire définitif de la position, collecteur de frais, et
 * seul juge de la graduation.
 *
 * `graduationProgress` ne lit pas le solde WETH du pool mais la quote que
 * *notre* position contient réellement au prix courant. Un virement direct au
 * pool ne la bouge donc pas — c'est ce qui distingue un jalon d'un chiffre
 * qu'on peut s'offrir.
 */
export const lockerAbi = parseAbi([
  "function treasury() view returns (address)",
  "function positions(address token) view returns (address pool, uint256 tokenId, int24 tickLower, int24 tickUpper, uint128 liquidity, address creator, bool quoteIsToken0)",
  "function liquidityNow(address token) view returns (uint128)",
  "function positionOwner(address token) view returns (address)",
  "function graduationProgress(address token) view returns (uint256)",
  "function graduated(address token) view returns (bool)",
  "function syncGraduation(address token)",
  "function collect(address token) returns (uint256 amount0, uint256 amount1)",
  "function GRADUATION_QUOTE() view returns (uint256)",
  "event Collected(address indexed token, uint256 amount0, uint256 amount1)",
  "event Graduated(address indexed token, address indexed pool, uint256 quoteAmount)",
]);

export const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function metadataURI() view returns (string)",
  "function pool() view returns (address)",
  "function quote() view returns (address)",
  "function launchedAt() view returns (uint64)",
  "function sellableNow(address holder) view returns (uint256)",
  // Le pendant côté achat : sans lui, un achat au-dessus de la rampe ne peut
  // qu'échouer en « TF », et l'interface n'a rien à dire à l'utilisateur.
  "function maxBuyNow() view returns (uint256)",
  "function buyOpensAt() view returns (uint256)",
  // `releasable` est le nom canonique : les deux portes de sortie ont fusionné,
  // il n'y a plus qu'un seul nombre. `windowRemaining` a disparu avec le
  // plafond d'impact, et `sellableNow` n'est plus qu'un alias conservé pour les
  // intégrations existantes.
  "function releasable(address holder) view returns (uint256)",
  "function lockedOf(address holder) view returns (uint256)",
  "function unlockedBps(address holder) view returns (uint256)",
  "function drawdownTicks(address holder) view returns (uint256)",
  "function balanceOf(address holder) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/**
 * Prépare l'appel. La transaction est signée par le wallet de l'utilisateur —
 * ce fichier n'a jamais accès à une clé.
 */
/**
 * L'appel de lancement, avec ou sans achat du créateur.
 *
 * Deux fonctions plutôt qu'un paramètre à zéro : `launchWithBuy` est payable et
 * refuse une valeur nulle, donc le choix se lit dans la transaction elle-même.
 * Un lancement qui s'est offert la première position ne doit pas ressembler à
 * un lancement qui ne l'a pas fait.
 */
export function launchCall(
  name: string,
  symbol: string,
  metadataURI: string,
  devBuyWei: bigint = 0n
) {
  return {
    address: LAUNCHER_ADDRESS as `0x${string}`,
    abi: launcherAbi,
    functionName: (devBuyWei > 0n ? "launchWithBuy" : "launch") as
      | "launch"
      | "launchWithBuy",
    args: [name, symbol, metadataURI] as const,
    value: devBuyWei,
  };
}

/**
 * Retrouve le token créé dans les journaux, plutôt que de deviner. Un `launch`
 * déploie aussi le pool, donc le reçu contient d'autres événements.
 */
export function tokenFromReceipt(receipt: TransactionReceipt) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== LAUNCHER_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: launcherAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Launched") {
        return {
          token: decoded.args.token as `0x${string}`,
          pool: decoded.args.pool as `0x${string}`,
        };
      }
    } catch {
      // Journal d'un autre événement : on continue.
    }
  }
  return null;
}

export function waitForLaunch(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

/** Lit un token déployé : tout vient de la chaîne, il n'y a pas de base. */
export async function readToken(address: `0x${string}`) {
  const [name, symbol, metadataURI, pool, launchedAt] = await Promise.all([
    publicClient.readContract({ address, abi: tokenAbi, functionName: "name" }),
    publicClient.readContract({ address, abi: tokenAbi, functionName: "symbol" }),
    publicClient.readContract({ address, abi: tokenAbi, functionName: "metadataURI" }),
    publicClient.readContract({ address, abi: tokenAbi, functionName: "pool" }),
    publicClient.readContract({ address, abi: tokenAbi, functionName: "launchedAt" }),
  ]);
  return { address, name, symbol, metadataURI, pool, launchedAt };
}
