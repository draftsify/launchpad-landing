import { createPublicClient, defineChain, http } from "viem";

/**
 * Robinhood Chain. Pile Arbitrum Orbit, déploiement de contrats permissionless.
 * Ne pas supposer le prédéploiement OP-stack `0x4200…0006` pour le WETH : cette
 * adresse ne porte aucun code ici.
 */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

/** Cible du déploiement. Bascule par variable d'environnement, pas par code. */
const target =
  process.env.NEXT_PUBLIC_CHAIN === "testnet" ? robinhoodTestnet : robinhood;

/**
 * Redirige les lectures et le réseau proposé au wallet vers un autre nœud, sans
 * changer le chainId. Sert à pointer un fork local (`anvil --fork-url …`) :
 * l'identifiant de chaîne reste celui de Robinhood, donc les adresses des
 * contrats déjà déployés là-bas — la factory Uniswap, le WETH — restent
 * valables, et rien dans l'application n'a besoin d'un cas particulier.
 *
 * Vide en production, où la valeur par défaut est le vrai nœud.
 */
const rpcOverride = process.env.NEXT_PUBLIC_RPC_URL?.trim();

export const activeChain = rpcOverride
  ? defineChain({
      ...target,
      rpcUrls: { default: { http: [rpcOverride] } },
    })
  : target;

/**
 * Adresse du launcher. Absente tant que rien n'est déployé — l'interface doit
 * le dire plutôt que d'envoyer une transaction dans le vide.
 */
export const LAUNCHER_ADDRESS = (process.env.NEXT_PUBLIC_LAUNCHER ?? "") as
  | `0x${string}`
  | "";

export const isDeployed = /^0x[0-9a-fA-F]{40}$/.test(LAUNCHER_ADDRESS);

/** Client de lecture : aucun wallet requis. */
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(),
});

export function explorerTx(hash: string) {
  const base = activeChain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function explorerAddress(address: string) {
  const base = activeChain.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : undefined;
}

/** Paramètres attendus par `wallet_addEthereumChain`. */
export function chainParams() {
  return {
    chainId: `0x${activeChain.id.toString(16)}`,
    chainName: activeChain.name,
    nativeCurrency: activeChain.nativeCurrency,
    rpcUrls: [...activeChain.rpcUrls.default.http],
    blockExplorerUrls: activeChain.blockExplorers
      ? [activeChain.blockExplorers.default.url]
      : undefined,
  };
}
