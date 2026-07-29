/**
 * Détoure le logo source (marque blanche sur fond noir opaque) :
 * - calcule la bounding box du contenu pour retirer les marges vides
 * - transforme le fond noir en transparence (alpha = luminance)
 * - exporte un PNG carré prêt à poser sur n'importe quel fond sombre
 *
 * Usage: node scripts/process-logo.mjs <source.png>
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = process.argv[2];
if (!SRC) {
  console.error("Usage: node scripts/process-logo.mjs <source.png>");
  process.exit(1);
}

const OUT_DIR = path.join(process.cwd(), "public");
const THRESHOLD = 20; // en dessous, on considère le pixel comme fond

const { data, info } = await sharp(SRC)
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
    const i = (y * width + x) * channels;
    const lum = Math.max(data[i], data[i + 1], data[i + 2]);
    if (lum > THRESHOLD) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX < 0) {
  console.error("Aucun contenu détecté dans l'image source.");
  process.exit(1);
}

const contentW = maxX - minX + 1;
const contentH = maxY - minY + 1;
const cx = minX + contentW / 2;
const cy = minY + contentH / 2;

// Crop serré au ratio naturel (lockup nav), marge de respiration de 4%
const padX = Math.round(contentW * 0.04);
const padY = Math.round(contentH * 0.04);
const left = Math.max(0, minX - padX);
const top = Math.max(0, minY - padY);
const cropW = Math.min(contentW + padX * 2, width - left);
const cropH = Math.min(contentH + padY * 2, height - top);

// Crop carré centré (favicon), marge de 8%
const side = Math.round(Math.max(contentW, contentH) * 1.08);
const sqLeft = Math.max(0, Math.round(cx - side / 2));
const sqTop = Math.max(0, Math.round(cy - side / 2));
const sqW = Math.min(side, width - sqLeft);
const sqH = Math.min(side, height - sqTop);

// Reconstruit la couche alpha depuis la luminance : le noir devient transparent,
// les bords antialiasés gardent une transition douce.
const rgba = Buffer.alloc(width * height * 4);
for (let p = 0; p < width * height; p++) {
  const i = p * channels;
  const lum = Math.max(data[i], data[i + 1], data[i + 2]);
  rgba[p * 4] = 255;
  rgba[p * 4 + 1] = 255;
  rgba[p * 4 + 2] = 255;
  rgba[p * 4 + 3] = lum;
}

await mkdir(OUT_DIR, { recursive: true });

const raw = { raw: { width, height, channels: 4 } };

const logoH = Math.round((512 * cropH) / cropW);
const logo = await sharp(rgba, raw)
  .extract({ left, top, width: cropW, height: cropH })
  .resize(512, logoH)
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(path.join(OUT_DIR, "logo.png"), logo);

const icon = await sharp(rgba, raw)
  .extract({ left: sqLeft, top: sqTop, width: sqW, height: sqH })
  .resize(256, 256)
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(path.join(OUT_DIR, "icon.png"), icon);

console.log(
  `source ${width}x${height} → contenu ${contentW}x${contentH} @ (${minX},${minY})`
);
console.log(`logo.png  ${512}x${logoH} (crop ${cropW}x${cropH})`);
console.log(`icon.png  256x256 (crop ${sqW}x${sqH})`);
