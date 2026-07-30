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

/**
 * Doit valoir `RevealToken.MAX_METADATA_BYTES`, à l'octet près.
 *
 * Le contrat refuse au-delà avec `StringTooLong`, et ce refus arrive après la
 * signature — donc après que l'utilisateur a cru lancer. Vérifier ici lui rend
 * un message avant.
 *
 * La marge est réelle : une vignette de 8 Ko plus la description et les liens
 * font environ 12 Ko une fois le document encodé en base64, pour un plafond à
 * 16 Ko. Un lancement complet coûte alors 18,1 M de gas, soit 0,00037 ETH sur
 * Robinhood Chain.
 */
export const MAX_METADATA_BYTES = 16_384;
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

  /**
   * Base64 plutôt que `encodeURIComponent`, et c'est une question de borne.
   *
   * Le document contient une vignette déjà encodée en base64 : la réencoder en
   * pourcent-échappement fait exploser chaque `+`, `/` et `=` en trois octets,
   * soit jusqu'à trois fois la taille, sans plafond prévisible. Le contrat
   * refuse au-delà de `MAX_METADATA_BYTES`, donc une borne floue côté client
   * se traduirait par des lancements qui échouent après signature.
   *
   * Base64 coûte exactement 4/3, quoi qu'il y ait dedans.
   */
  const json = JSON.stringify(clean);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/json;base64,${btoa(binary)}`;
}

/** Lit un `metadataURI` produit par `toDataUri`, ou une URL classique. */
export function parseMetadata(uri: string): TokenMetadata | null {
  if (!uri.startsWith("data:application/json")) return null;
  try {
    const comma = uri.indexOf(",");
    const body = uri.slice(comma + 1);
    if (!uri.slice(0, comma).includes(";base64")) {
      return JSON.parse(decodeURIComponent(body));
    }
    // `atob` rend une chaîne d'octets : la relire en UTF-8, sinon un accent
    // dans la description ressort en mojibake.
    const binary = atob(body);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
