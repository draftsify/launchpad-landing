import { NextResponse } from "next/server";

/**
 * Épingle l'image d'un lancement sur IPFS, et rend son CID.
 *
 * Pourquoi le serveur et pas le navigateur : la clé Pinata ouvre le compte qui
 * paie le stockage. Envoyée au navigateur, elle serait lisible par n'importe
 * quel visiteur, qui pourrait y épingler ce qu'il veut. Elle reste donc ici,
 * sans préfixe `NEXT_PUBLIC_`, et cette route est la seule à s'en servir.
 *
 * Ce que ça ajoute au protocole : rien. La chaîne continue de porter une
 * vignette complète, et le site continue de peindre à partir d'elle. IPFS
 * porte l'image d'origine — plus grande, plus nette, lisible par n'importe quel
 * indexeur qui sait résoudre un `ipfs://`, ce qu'aucun ne sait faire d'un
 * appel à `metadataURI()`. Si l'épinglage échoue, le lancement continue avec sa
 * vignette : la fonctionnalité est un supplément, jamais une dépendance.
 */
export const runtime = "nodejs";

/**
 * Deux mégaoctets, et la borne est double.
 *
 * Vercel coupe une requête de fonction au-delà de quatre, donc au-dessus la
 * réponse serait un échec réseau illisible plutôt qu'un message. Et cette route
 * est ouverte : elle dépense le quota d'un compte tiers pour qui la trouve. Une
 * borne basse rend l'abus lent sans gêner un logo.
 */
const MAX_BYTES = 2 * 1024 * 1024;

/** Ce qu'un navigateur sait peindre, et rien d'autre. SVG exclu : c'est un
 *  document, pas une image, et il peut charger ce qu'il veut. */
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) {
    return NextResponse.json({ error: "Pinning is not configured" }, { status: 503 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const found = form.get("file");
    if (found instanceof File) file = found;
  } catch {
    return NextResponse.json({ error: "Expected a multipart form" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!TYPES.has(file.type)) {
    return NextResponse.json({ error: "Not a raster image" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const upload = new FormData();
  upload.append("file", file, file.name || "image");
  /**
   * `public`, sinon le CID n'existe que chez Pinata.
   *
   * Un fichier déposé en réseau privé n'est servi que par la passerelle du
   * compte, avec un jeton : aucun indexeur ne le résoudrait, ce qui viderait
   * l'opération de son sens. En public, le CID est un CID — n'importe quelle
   * passerelle peut le servir, y compris le jour où ce compte n'existe plus.
   */
  upload.append("network", "public");

  try {
    /**
     * L'API v3, et pas `pinFileToIPFS`.
     *
     * L'ancien point d'entrée répond `NO_SCOPES_FOUND` aux clés récentes : les
     * clés délivrées aujourd'hui ne portent plus les permissions v2. Constaté
     * en interrogeant les deux avec la même clé — l'une refuse, l'autre rend un
     * CID.
     */
    const response = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: upload,
    });

    if (!response.ok) {
      // Le message de Pinata peut contenir des détails de compte : on renvoie
      // le code, pas le corps.
      return NextResponse.json(
        { error: `Pinning failed (${response.status})` },
        { status: 502 }
      );
    }

    const { data } = (await response.json()) as { data?: { cid?: string } };
    if (!data?.cid) {
      return NextResponse.json({ error: "Pinning returned no CID" }, { status: 502 });
    }

    return NextResponse.json({ cid: data.cid, uri: `ipfs://${data.cid}` });
  } catch {
    return NextResponse.json({ error: "Pinning failed" }, { status: 502 });
  }
}
