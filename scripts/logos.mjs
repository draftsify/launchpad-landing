/**
 * Génère public/logos/*.svg.
 *
 * Les glyphes viennent de Simple Icons (CC0), sauf Uniswap qui n'y figure pas :
 * on récupère alors l'icône officielle du dépôt brand-assets, déjà en blanc.
 * Tout est écrit en local, aucune requête vers un CDN tiers au runtime.
 *
 * Usage: node scripts/logos.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as si from "simple-icons";

const OUT_DIR = path.join(process.cwd(), "public", "logos");
const COLOR = "#fafafa";

// Coinbase écarté : son entrée Simple Icons est un wordmark, illisible à 20px
// et incohérent avec les glyphes géométriques des autres.
const FROM_SIMPLE_ICONS = [
  "ethereum",
  "chainlink",
  "walletconnect",
  "optimism",
  "polygon",
];

const UNISWAP_URL =
  "https://raw.githubusercontent.com/Uniswap/brand-assets/main/Uniswap%20Brand%20Assets/Uniswap_icon_white.svg";

await mkdir(OUT_DIR, { recursive: true });

for (const slug of FROM_SIMPLE_ICONS) {
  const key = "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
  const icon = si[key];
  if (!icon) {
    console.error(`introuvable dans simple-icons: ${slug}`);
    process.exit(1);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${COLOR}"><title>${icon.title}</title><path d="${icon.path}"/></svg>`;
  await writeFile(path.join(OUT_DIR, `${slug}.svg`), svg);
  console.log(`écrit: logos/${slug}.svg`);
}

const res = await fetch(UNISWAP_URL);
if (!res.ok) {
  console.error(`échec du téléchargement Uniswap: ${res.status}`);
  process.exit(1);
}
await writeFile(path.join(OUT_DIR, "uniswap.svg"), await res.text());
console.log("écrit: logos/uniswap.svg (source officielle)");
