export type TokenMetadata = {
  name: string;
  symbol: string;
  description?: string;
  /**
   * Ce que le reste du monde lit : `ipfs://<cid>` pour les lancements récents,
   * un data URI pour ceux d'avant IPFS. Les deux formes sont acceptées à la
   * lecture parce que les tokens déjà lancés ne se réécrivent pas.
   */
  image?: string;
  /**
   * La vignette carrée, dans le contrat, en data URI.
   *
   * Elle existe pour que ce site n'ait jamais besoin du réseau pour peindre une
   * liste : la chaîne suffit. IPFS porte l'image d'origine, plus grande et plus
   * nette, mais il faut aller la chercher — et si plus personne ne l'épingle,
   * elle disparaît. Ce qui est écrit ici, non.
   */
  thumbnail?: string;
  website?: string;
  x?: string;
  telegram?: string;
  discord?: string;
};

/**
 * Un CID, tel qu'il apparaît derrière `ipfs://`.
 *
 * Volontairement étroit : base32 v1 (commence par `b`) ou base58 v0 (`Qm…`).
 * Aucun chemin, aucune requête, aucun `../` — ce qui suit va être recollé dans
 * une URL de passerelle côté serveur, et un segment libre y ferait interroger
 * autre chose que le contenu annoncé.
 */
export const IPFS_CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;

/** Le CID d'un `ipfs://…`, ou null. */
export function ipfsCid(value: string | undefined) {
  if (!value?.startsWith("ipfs://")) return null;
  const cid = value.slice("ipfs://".length);
  return IPFS_CID.test(cid) ? cid : null;
}

/**
 * Ce qu'une balise `img` doit recevoir, dans l'ordre où on le préfère.
 *
 * La vignette de la chaîne d'abord : elle est déjà là, elle ne coûte aucune
 * requête et elle ne peut pas tomber. IPFS ensuite, à travers notre passerelle
 * — jamais l'adresse d'une passerelle tierce, qui ferait porter l'adresse IP du
 * visiteur à un hôte choisi par le créateur du token.
 *
 * Un seul endroit décide, parce que ce choix se prend au moins à cinq endroits
 * dans l'interface et qu'il ne doit pas y diverger.
 */
export function imageSrc(meta: TokenMetadata | null | undefined) {
  if (meta?.thumbnail) return meta.thumbnail;
  const cid = ipfsCid(meta?.image);
  if (cid) return `/api/ipfs/${cid}`;
  return undefined;
}

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

/**
 * Tailles et qualités tentées, dans l'ordre du meilleur rendu au plus dégradé.
 *
 * Une seule dimension ne suffisait pas. La vignette faisait 128 px de côté pour
 * une tuile affichée à 96 px CSS : nette sur un écran ordinaire, visiblement
 * molle sur un écran à deux fois la densité, c'est-à-dire sur à peu près tous
 * les téléphones. On part donc de 256 px et on ne descend que si le budget
 * l'impose.
 *
 * La qualité plancher remonte avec la taille : 256 px à 0,4 de qualité est plus
 * laid que 192 px à 0,8, donc on préfère réduire la taille plutôt que de
 * laisser les artefacts s'installer.
 */
const LADDER = [
  { side: 256, qualities: [0.85, 0.7, 0.55] },
  { side: 192, qualities: [0.8, 0.6] },
  { side: 128, qualities: [0.8, 0.6, 0.4, 0.25] },
] as const;

/**
 * Réduit une image à une vignette carrée tenant dans `MAX_IMAGE_BYTES`,
 * encodée en data URI.
 *
 * Le but est de pouvoir écrire les métadonnées entières dans le contrat, sans
 * dépendre d'IPFS ni d'un serveur : un token reste lisible tant que la chaîne
 * existe, ce qu'aucun service de pinning ne garantit. Le prix à payer est une
 * vignette, pas une illustration.
 *
 * **Carrée, et c'est nouveau.** La vignette conservait le format d'origine,
 * alors que toutes les tuiles du site sont carrées et recadrent en `cover` : un
 * logo en bandeau se faisait couper les deux bouts, c'est-à-dire précisément le
 * nom. L'image est maintenant centrée sur un carré, donc ce qui est stocké est
 * ce qui sera vu, partout et sans recadrage.
 */
export async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas unavailable");
  }

  /**
   * Tous les navigateurs ne savent pas *encoder* du WebP, même quand ils
   * savent l'afficher — Safari ne l'a appris qu'en 16.4. Et `toDataURL` ne
   * signale pas l'échec : il rend un PNG sans prévenir, en ignorant le
   * paramètre de qualité. Toute la boucle de compression tournait alors dans le
   * vide et l'utilisateur voyait « image trop complexe » sur un logo trivial.
   * On teste donc ce qui sort vraiment, sur un canevas jetable.
   */
  canvas.width = 8;
  canvas.height = 8;
  const webp = canvas.toDataURL("image/webp", 0.8).startsWith("data:image/webp");
  const type = webp ? "image/webp" : "image/jpeg";

  try {
    for (const { side, qualities } of LADDER) {
      canvas.width = side;
      canvas.height = side;
      ctx.clearRect(0, 0, side, side);
      // JPEG n'a pas de couche alpha : sans fond, la transparence devient
      // noire. Le WebP, lui, garde le détourage du logo.
      if (!webp) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, side, side);
      }

      const scale = Math.min(side / bitmap.width, side / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, (side - width) / 2, (side - height) / 2, width, height);

      // On redescend la qualité jusqu'à tenir dans le budget plutôt que de
      // refuser l'image : l'utilisateur n'a pas à deviner un taux de
      // compression.
      for (const quality of qualities) {
        const url = canvas.toDataURL(type, quality);
        if (byteLength(url) <= MAX_IMAGE_BYTES) return url;
      }
    }
  } finally {
    bitmap.close();
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
  /**
   * `decimals` est écrit alors que personne ici ne le lit, et c'est le but :
   * ERC-1046 décrit le document que `tokenURI()` doit rendre, et il attend ce
   * champ. Le token expose désormais son URI sous ce nom standard, donc autant
   * que ce qu'il rend soit conforme à la norme qu'il annonce suivre. Dix-huit
   * est la seule valeur possible — `RevealToken` n'expose pas de décimales
   * réglables.
   */
  const clean: TokenMetadata & { decimals: number } = {
    name: meta.name,
    symbol: meta.symbol,
    decimals: 18,
  };
  for (const key of [
    "description",
    "image",
    "thumbnail",
    "website",
    "x",
    "telegram",
    "discord",
  ] as const) {
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

/* -------------------------------- lecture -------------------------------- */

/**
 * Formats d'image acceptés à l'affichage. Rasters, et data URI uniquement.
 *
 * SVG en est volontairement absent : c'est un document, pas une image. Il se
 * comporte différemment selon le moteur et peut référencer des ressources
 * externes, alors que ce que notre formulaire produit est toujours du WebP. Un
 * format qu'on n'émet pas et dont on ne maîtrise pas le rendu n'a rien à faire
 * dans une page qui affiche des données écrites par des inconnus.
 */
const IMAGE_URI = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Bornes d'affichage. Le contrat borne les octets, pas la mise en page. */
const MAX_DESCRIPTION_CHARS = 1_000;
const MAX_HANDLE_CHARS = 128;

/**
 * Caractères de contrôle et marques bidirectionnelles.
 *
 * Les premiers cassent la mise en page de façons pénibles à reproduire. Les
 * secondes sont pires : elles font afficher à l'écran l'inverse de ce que la
 * chaîne contient, ce qui est exactement l'outil qu'il faut pour se faire
 * passer pour un autre token.
 */
const UNSAFE_CHARS = /[ -‎‏‪-‮⁦-⁩]/;

function text(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return UNSAFE_CHARS.test(trimmed) ? undefined : trimmed;
}

/**
 * Une adresse de site, rendue sans son schéma — le rendu remet `https://`.
 *
 * Analysée par le parseur d'URL du navigateur plutôt que par une expression
 * régulière. La première version en utilisait une, et elle refusait toute
 * adresse portant une chaîne de requête : `x.com/search?q=leafcat` est un lien
 * parfaitement valide, et il disparaissait sans un mot. Une règle inventée pour
 * écarter `javascript:` finissait par écarter la moitié du web.
 */
function url(value: unknown) {
  const raw = text(value, MAX_HANDLE_CHARS);
  if (!raw) return undefined;

  const withoutScheme = raw.replace(/^https?:\/\//i, "");
  // Un schéma restant après ce retrait n'est pas http : c'est ce qu'on refuse.
  if (/^[a-z][a-z0-9+.-]*:/i.test(withoutScheme)) return undefined;

  try {
    const parsed = new URL(`https://${withoutScheme}`);
    // Un hôte sans point n'est pas un domaine, et des identifiants dans
    // l'autorité servent surtout à masquer où le lien mène vraiment.
    if (!parsed.hostname.includes(".")) return undefined;
    if (parsed.username || parsed.password) return undefined;
    return withoutScheme;
  } catch {
    return undefined;
  }
}

/**
 * Un pseudo, éventuellement collé sous forme d'URL complète.
 *
 * Le formulaire préfixe le champ par `x.com/`, donc il attend `moncompte`. Rien
 * n'empêche d'y coller `https://x.com/moncompte`, et le rendu produirait alors
 * `x.com/https://x.com/moncompte`. On retire donc l'hôte connu, et ce qui reste
 * doit être un pseudo — pas un chemin, pas une recherche.
 */
const RESERVED = new Set([
  "search",
  "home",
  "explore",
  "notifications",
  "messages",
  "i",
  "intent",
  "share",
  "hashtag",
  "settings",
  "login",
  "signup",
  "joinchat",
  "s",
]);

function pseudo(value: unknown, hosts: readonly string[]) {
  const raw = text(value, MAX_HANDLE_CHARS);
  if (!raw) return undefined;

  let handle = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^@/, "");
  for (const host of hosts) {
    if (handle.toLowerCase().startsWith(`${host}/`)) {
      handle = handle.slice(host.length + 1);
      break;
    }
  }

  /**
   * Ce qui suit le pseudo est retiré, pas rejeté.
   *
   * Un lien copié depuis un navigateur traîne presque toujours quelque chose :
   * `x.com/moncompte?lang=fr` en sortant de l'application, une barre finale en
   * sortant de la barre d'adresse. La règle précédente exigeait un pseudo nu et
   * jetait tout le reste **en silence** — vu sur un vrai lancement, dont le lien
   * X n'est jamais apparu alors que le créateur l'avait rempli.
   *
   * Le contraire du champ `website`, où la chaîne de requête fait partie de
   * l'adresse et doit être gardée. Ici elle n'en fait pas partie : un pseudo ne
   * contient ni `?` ni `#` ni `/`.
   */
  handle = handle.split(/[?#]/)[0].replace(/\/+$/, "");

  /**
   * Ce qui a la forme d'un pseudo sans en être un.
   *
   * Retirer la chaîne de requête transforme `x.com/search?q=leafcat` en
   * `search`, qui passe la validation et afficherait `@search`. Ces mots sont
   * réservés par les plateformes et ne peuvent appartenir à personne : les
   * écarter coûte une liste courte et évite d'afficher un lien qui ne mène pas
   * où le créateur croyait.
   */
  if (RESERVED.has(handle.toLowerCase())) return undefined;

  return /^[A-Za-z0-9_.-]{1,64}$/.test(handle) ? handle : undefined;
}

/**
 * Ne garde d'un document que ce qu'on sait afficher sans danger.
 *
 * Le point important : `metadataURI` est un argument de `launch`, donc son
 * contenu est écrit par qui lance le token — pas forcément par ce formulaire.
 * Mesuré avant d'écrire ceci : un champ `image` pointant vers `https://…` était
 * rendu tel quel, ce qui faisait charger l'adresse choisie par le créateur par
 * **chaque visiteur** du launchpad. Une image doit donc être un data URI, ou ne
 * pas être.
 */
function sanitize(raw: unknown): TokenMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const meta: TokenMetadata = {
    name: text(r.name, MAX_HANDLE_CHARS) ?? "",
    symbol: text(r.symbol, MAX_HANDLE_CHARS) ?? "",
  };

  /**
   * Deux champs, deux règles, et la différence n'est pas cosmétique.
   *
   * `thumbnail` est peint directement par le navigateur : il ne peut donc être
   * qu'un data URI raster, borné. `image` n'est jamais rendu tel quel — il
   * passe par notre passerelle, qui vérifie le type et la taille de ce qui
   * revient — donc `ipfs://` y est admis. Aucun `http(s)://` nulle part : une
   * adresse choisie par le créateur du token serait chargée par chaque
   * visiteur, et le contenu derrière peut changer à tout moment. Un CID, non.
   */
  const bounded = (value: unknown) => {
    const raw = typeof value === "string" ? value.trim() : "";
    return IMAGE_URI.test(raw) && byteLength(raw) <= MAX_IMAGE_BYTES * 2
      ? raw
      : undefined;
  };

  const image = typeof r.image === "string" ? r.image.trim() : "";
  if (ipfsCid(image)) meta.image = image;
  else {
    // Les tokens lancés avant IPFS portent la vignette dans `image` : la lire
    // comme telle évite qu'ils perdent leur logo en changeant de format.
    const inline = bounded(image);
    if (inline) meta.image = inline;
  }

  const thumbnail = bounded(r.thumbnail) ?? bounded(image);
  if (thumbnail) meta.thumbnail = thumbnail;

  const description = text(r.description, MAX_DESCRIPTION_CHARS);
  if (description) meta.description = description;

  const website = url(r.website);
  if (website) meta.website = website;

  const handles = {
    x: ["x.com", "twitter.com"],
    telegram: ["t.me", "telegram.me"],
    discord: ["discord.gg", "discord.com"],
  } as const;
  for (const [key, hosts] of Object.entries(handles) as [
    keyof typeof handles,
    readonly string[],
  ][]) {
    const handle = pseudo(r[key], hosts);
    if (handle) meta[key] = handle;
  }

  return meta;
}

/** Lit un `metadataURI` produit par `toDataUri`, ou une URL classique. */
export function parseMetadata(uri: string): TokenMetadata | null {
  if (!uri.startsWith("data:application/json")) return null;
  try {
    const comma = uri.indexOf(",");
    const body = uri.slice(comma + 1);
    if (!uri.slice(0, comma).includes(";base64")) {
      return sanitize(JSON.parse(decodeURIComponent(body)));
    }
    // `atob` rend une chaîne d'octets : la relire en UTF-8, sinon un accent
    // dans la description ressort en mojibake.
    const binary = atob(body);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
