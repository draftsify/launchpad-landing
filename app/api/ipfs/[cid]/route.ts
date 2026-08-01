import { IPFS_CID } from "@/lib/metadata";

/**
 * Sert un contenu IPFS depuis notre origine, sous conditions.
 *
 * Pourquoi ne pas mettre l'URL de la passerelle directement dans une balise
 * `img` : le CID vient d'un document écrit par le créateur du token. Pointer
 * dessus ferait interroger une passerelle tierce par chaque visiteur, avec
 * l'adresse IP de chacun, pour un contenu dont personne n'a vérifié ni le type
 * ni la taille. Ici on va le chercher une fois, on refuse ce qui n'est pas une
 * image raster, on refuse ce qui est trop gros, et on sert des octets.
 *
 * Ce qu'un CID garantit et qu'une URL ne garantit pas : le contenu ne peut pas
 * changer après coup. Ce qui est servi ici est ce qui a été épinglé, ou rien.
 */
export const revalidate = false;

const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 4 * 1024 * 1024;
const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cid: string }> }
) {
  const { cid } = await params;
  if (!IPFS_CID.test(cid)) return new Response("Not a CID", { status: 400 });

  for (const gateway of GATEWAYS) {
    try {
      const response = await fetch(`${gateway}${cid}`, {
        // Une passerelle lente ne doit pas retenir une fonction : on essaie la
        // suivante plutôt que d'attendre.
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;

      const type = response.headers.get("content-type")?.split(";")[0]?.trim();
      if (!type || !TYPES.has(type)) continue;

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) continue;

      return new Response(bytes, {
        headers: {
          "content-type": type,
          "content-length": String(bytes.byteLength),
          "cache-control": IMMUTABLE,
          "access-control-allow-origin": "*",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      // Passerelle muette ou trop lente : la suivante.
    }
  }

  return new Response("Not retrievable", { status: 404 });
}
