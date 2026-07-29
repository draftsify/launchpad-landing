export type TokenMetadata = {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  website?: string;
  x?: string;
  telegram?: string;
  discord?: string;
};

/**
 * Taille maximale de l'image encodée, en octets. Le stockage on-chain coûte
 * environ 20 000 gas par tranche de 32 octets : 8 Ko représentent ~5 M de gas,
 * ce qui reste modeste sur un L2 mais devient absurde au-delà.
 */
export const MAX_IMAGE_BYTES = 8_192;
const MAX_DIMENSION = 128;

/**
 * Réduit une image à une vignette WebP tenant dans `MAX_IMAGE_BYTES`, encodée
 * en data URI.
 *
 * Le but est de pouvoir écrire les métadonnées entières dans le contrat, sans
 * dépendre d'IPFS ni d'un serveur : un token reste lisible tant que la chaîne
 * existe, ce qu'aucun service de pinning ne garantit. Le prix à payer est une
 * vignette, pas une illustration.
 */
export async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // On redescend la qualité jusqu'à tenir dans le budget plutôt que de
  // refuser l'image : l'utilisateur n'a pas à deviner un taux de compression.
  for (const quality of [0.8, 0.6, 0.45, 0.3, 0.2]) {
    const url = canvas.toDataURL("image/webp", quality);
    if (byteLength(url) <= MAX_IMAGE_BYTES) return url;
  }
  throw new Error("Image too complex to compress — try a simpler one");
}

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

/**
 * Encode les métadonnées en data URI. Rien n'est hébergé nulle part : le
 * contrat porte le document lui-même.
 */
export function toDataUri(meta: TokenMetadata) {
  const clean: TokenMetadata = { name: meta.name, symbol: meta.symbol };
  for (const key of ["description", "image", "website", "x", "telegram", "discord"] as const) {
    const value = meta[key]?.trim();
    if (value) clean[key] = value;
  }
  return `data:application/json,${encodeURIComponent(JSON.stringify(clean))}`;
}

/** Lit un `metadataURI` produit par `toDataUri`, ou une URL classique. */
export function parseMetadata(uri: string): TokenMetadata | null {
  if (!uri.startsWith("data:application/json")) return null;
  try {
    const comma = uri.indexOf(",");
    const body = uri.slice(comma + 1);
    return JSON.parse(
      uri.slice(0, comma).includes(";base64") ? atob(body) : decodeURIComponent(body)
    );
  } catch {
    return null;
  }
}
