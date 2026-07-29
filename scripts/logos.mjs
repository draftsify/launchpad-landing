/**
 * Génère public/logos/*.svg et public/logos/manifest.json.
 *
 * Trois provenances, aucune n'est utilisable telle quelle :
 *  - Ethereum : Simple Icons (CC0), glyphe monochrome déjà propre
 *  - Uniswap  : absent de Simple Icons, icône officielle du dépôt brand-assets
 *  - Phantom / Solflare : absents aussi, récupérés depuis wallet-adapter. Ce
 *    sont des icônes d'application (fond coloré plein + marque), donc un simple
 *    filtre de blanchiment les réduirait à un carré blanc. On retire le fond et
 *    on force la marque en blanc.
 *
 * Chaque viewBox est ensuite recadré sur le contenu réel, sinon les marques
 * issues d'icônes d'app garderaient la marge du carré et paraîtraient
 * nettement plus petites que les autres.
 *
 * Tout est écrit en local : aucune requête CDN au runtime.
 *
 * Usage: node scripts/logos.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as si from "simple-icons";

const OUT_DIR = path.join(process.cwd(), "public", "logos");
const COLOR = "#fafafa";
const MARGIN = 0.02; // marge relative laissée autour de la marque

const WALLET_ADAPTER =
  "https://raw.githubusercontent.com/anza-xyz/wallet-adapter/master/packages/wallets";
const UNISWAP_URL =
  "https://raw.githubusercontent.com/Uniswap/brand-assets/main/Uniswap%20Brand%20Assets/Uniswap_icon_white.svg";

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} sur ${url}`);
  return res.text();
}

/** Extrait le data URI d'icône embarqué dans un adapter wallet-adapter. */
async function walletIcon(name) {
  const src = await fetchText(`${WALLET_ADAPTER}/${name}/src/adapter.ts`);
  const match = src.match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/);
  if (!match) throw new Error(`aucune icône SVG trouvée pour ${name}`);
  return Buffer.from(match[1], "base64").toString("utf8");
}

/** Recadre le viewBox sur les pixels réellement opaques. */
async function trimViewBox(svg) {
  const vb = svg.match(/viewBox="([\d.\-\s]+)"/);
  if (!vb) return svg;
  const [vx, vy, vw, vh] = vb[1].trim().split(/\s+/).map(Number);

  const { data, info } = await sharp(Buffer.from(svg), { density: 600 })
    .resize({ width: 600 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return svg;

  const mx = vw * MARGIN;
  const my = vh * MARGIN;
  const nx = vx + (minX / width) * vw - mx;
  const ny = vy + (minY / height) * vh - my;
  const nw = ((maxX - minX + 1) / width) * vw + mx * 2;
  const nh = ((maxY - minY + 1) / height) * vh + my * 2;

  const rounded = [nx, ny, nw, nh].map((n) => Math.round(n * 100) / 100);
  return {
    svg: svg.replace(/viewBox="[\d.\-\s]+"/, `viewBox="${rounded.join(" ")}"`),
    ratio: nw / nh,
  };
}

await mkdir(OUT_DIR, { recursive: true });
const manifest = {};

async function emit(slug, svg) {
  // Les dimensions fixes empêcheraient la mise à l'échelle par le viewBox.
  let out = svg.replace(/\s(width|height)="[^"]*"/g, "");
  const trimmed = await trimViewBox(out);
  out = trimmed.svg ?? out;
  await writeFile(path.join(OUT_DIR, `${slug}.svg`), out);
  manifest[slug] = { ratio: Math.round((trimmed.ratio ?? 1) * 1000) / 1000 };
  console.log(`écrit: logos/${slug}.svg  ratio ${manifest[slug].ratio}`);
}

// --- Ethereum : Simple Icons ------------------------------------------------
await emit(
  "ethereum",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${COLOR}"><title>Ethereum</title><path d="${si.siEthereum.path}"/></svg>`
);

// --- Uniswap : icône officielle, déjà blanche sur fond transparent ----------
await emit("uniswap", await fetchText(UNISWAP_URL));

// --- Phantom : rect violet à retirer, fantôme à blanchir -------------------
{
  let svg = await walletIcon("phantom");
  svg = svg.replace(/<rect[^>]*\/>/g, "");
  svg = svg.replace(/fill="#FFFDF8"/gi, `fill="${COLOR}"`);
  await emit("phantom", svg);
}

// --- Solflare : rect jaune à retirer, marque bicolore à aplatir ------------
{
  let svg = await walletIcon("solflare");
  // Le bloc <style> doit sauter : une règle CSS l'emporterait sur l'attribut
  // fill qu'on pose ensuite sur le path.
  svg = svg.replace(/<defs>[\s\S]*?<\/defs>/g, "");
  svg = svg.replace(/<rect[^>]*\/>/g, "");
  svg = svg.replace(/\sclass="[^"]*"/g, "");
  svg = svg.replace(/<path/g, `<path fill="${COLOR}"`);
  await emit("solflare", svg);
}

// Le ratio de chaque marque est propre à son recadrage : on le fige dans un
// module généré, pour que le composant réserve la bonne largeur sans le
// deviner ni décaler la mise en page au chargement.
const ts =
  `// Généré par scripts/logos.mjs — ne pas éditer à la main.\n` +
  `export const LOGO_RATIOS = ${JSON.stringify(
    Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.ratio])),
    null,
    2
  )} as const;\n`;
await writeFile(path.join(process.cwd(), "lib", "logo-ratios.ts"), ts);
console.log("écrit: lib/logo-ratios.ts");
