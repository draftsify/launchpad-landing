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

/**
 * Limite de gas à passer au wallet, estimée puis majorée.
 *
 * Ne pas la fournir laisse le wallet estimer, et son estimation est trop juste
 * pour un swap Uniswap V3 : `eth_estimateGas` mesure le coût dans l'état
 * courant, alors que la transaction s'exécute un bloc plus tard, où traverser un
 * tick non initialisé, écrire une observation d'oracle ou toucher un slot froid
 * coûte davantage. Le résultat est un OutOfGas qui ressemble à un refus du
 * protocole alors que le swap était valide — vu et diagnostiqué sur le fork.
 *
 * La marge est large parce que se tromper vers le bas coûte une transaction
 * perdue, alors que se tromper vers le haut ne coûte rien : le gas non consommé
 * n'est pas facturé.
 */
export async function gasWithBuffer(tx: {
  account: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}) {
  const estimate = await publicClient.estimateGas(tx);
  return (estimate * 3n) / 2n;
}

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
