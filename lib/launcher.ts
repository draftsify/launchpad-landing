import { decodeEventLog, parseAbi, type Hash, type TransactionReceipt } from "viem";

import { LAUNCHER_ADDRESS, publicClient } from "@/lib/chain";

/// Sous-ensemble de RevealLauncher dont l'interface a besoin.
export const launcherAbi = parseAbi([
  "function launch(string name, string symbol, string metadataURI) returns (address token, address pool)",
  "function tokenCount() view returns (uint256)",
  "function tokens(uint256) view returns (address)",
  "function supply() view returns (uint256)",
  "function rules() view returns (uint16 initialUnlockBps, uint32 unlockSeconds, uint16 impactCapBps, uint32 impactWindow, uint32 launchDelay, uint32 buyRamp)",
  "event Launched(address indexed token, address indexed creator, address pool, uint256 supply, int24 tickLower, int24 tickUpper, (uint16,uint32,uint16,uint32,uint32,uint32) rules)",
]);

export const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function metadataURI() view returns (string)",
  "function pool() view returns (address)",
  "function launchedAt() view returns (uint64)",
  "function sellableNow(address holder) view returns (uint256)",
  "function releasable(address holder) view returns (uint256)",
  "function windowRemaining(address holder) view returns (uint256)",
  "function unlockedBps(address holder) view returns (uint256)",
  "function balanceOf(address holder) view returns (uint256)",
]);

/**
 * Prépare l'appel. La transaction est signée par le wallet de l'utilisateur —
 * ce fichier n'a jamais accès à une clé.
 */
export function launchCall(name: string, symbol: string, metadataURI: string) {
  return {
    address: LAUNCHER_ADDRESS as `0x${string}`,
    abi: launcherAbi,
    functionName: "launch" as const,
    args: [name, symbol, metadataURI] as const,
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
