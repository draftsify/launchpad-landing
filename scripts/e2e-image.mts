/**
 * Aller-retour complet d'une image : formulaire -> contrat -> affichage.
 *
 * Le seul test qui compte pour « est-ce que les images s'affichent » : il écrit
 * un vrai fichier PNG dans un vrai contrat sur un fork de la vraie chaîne, puis
 * relit exactement ce que le site relirait.
 *
 * Hors CI, parce qu'il lui faut un fork qui tourne :
 *
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
 *   npm run test:e2e-image
 *
 * L'adresse du launcher est celle du deploiement en cours ; la mettre a jour
 * si elle change.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { toDataUri, parseMetadata, byteLength, MAX_METADATA_BYTES } from "../lib/metadata.ts";

const RPC = "http://127.0.0.1:8545";
const LAUNCHER = "0x94d97C7AEc431b989132e3664b7cB3613CaC5b81" as const;
// Clé de test publiée par Foundry. Elle ne protège rien.
const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

const chain = {
  id: 4663,
  name: "Robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const launcherAbi = parseAbi([
  "function launch(string name, string symbol, string metadataURI) returns (address token, address pool)",
  "event Launched(address indexed token, address indexed creator, address pool, uint256 tokenId, uint256 supply, uint128 liquidity, int24 tickLower, int24 tickUpper, (uint16,uint32,uint32,uint32) rules)",
]);
const tokenAbi = parseAbi(["function metadataURI() view returns (string)"]);

const image = "data:image/png;base64," + readFileSync(new URL("../app/icon.png", import.meta.url)).toString("base64");
const uri = toDataUri({
  name: "Image Test",
  symbol: "IMG",
  description: "Une vraie image, écrite dans le contrat. Accents: éàü.",
  image,
  website: "https://launchonreveal.com",
  x: "launchonreveal",
});

console.log("image           :", byteLength(image), "octets");
console.log("document entier :", byteLength(uri), "/", MAX_METADATA_BYTES, "octets");
if (byteLength(uri) > MAX_METADATA_BYTES) {
  console.log("ECHEC: le document depasse la borne du contrat");
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const hash = await wallet.writeContract({
  address: LAUNCHER,
  abi: launcherAbi,
  functionName: "launch",
  args: ["Image Test", "IMG", uri],
  gas: 25_000_000n,
});
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log("lancement       :", receipt.status, "-", receipt.gasUsed, "gas");
if (receipt.status !== "success") process.exit(1);

const token = receipt.logs
  .filter((l) => l.address.toLowerCase() === LAUNCHER.toLowerCase())
  .map((l) => "0x" + l.topics[1]!.slice(26))[0] as `0x${string}`;
console.log("token           :", token);

// Ce que le site lit, exactement : la chaîne du contrat, passee au parseur.
const stored = await pub.readContract({ address: token, abi: tokenAbi, functionName: "metadataURI" });
const meta = parseMetadata(stored);

let fail = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) fail++;
  console.log(`  ${ok ? "ok    " : "ECHEC "} ${label}`);
};

console.log("relecture depuis la chaine :");
check("le document est identique a l'octet pres", stored === uri);
check("les metadonnees se parsent", meta !== null);
check("l'image revient identique", meta?.image === image);
check("la description garde ses accents", meta?.description?.includes("éàü") === true);
check("le site retrouve le lien", meta?.website === "launchonreveal.com");
check("le site retrouve le pseudo x", meta?.x === "launchonreveal");

console.log(fail ? `\n${fail} echec(s)` : "\nAller-retour complet reussi.");
process.exit(fail ? 1 : 0);
