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
export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN === "testnet" ? robinhoodTestnet : robinhood;

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
