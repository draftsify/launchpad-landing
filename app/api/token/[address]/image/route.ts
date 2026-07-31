import { publicClient, isDeployed, LAUNCHER_ADDRESS } from "@/lib/chain";
import { tokenAbi } from "@/lib/launcher";
import { parseMetadata } from "@/lib/metadata";

/**
 * Le logo d'un token, servi comme une vraie image.
 *
 * Pourquoi cette route existe : le logo vit dans le contrat, à l'intérieur d'un
 * data URI rendu par `metadataURI()`. C'est excellent pour la permanence — un
 * token reste lisible tant que la chaîne existe, sans épingle IPFS ni serveur à
 * payer — et parfaitement illisible pour tout le reste du monde. `metadataURI`
 * est une fonction propre à ce protocole : aucun agrégateur, aucun portefeuille,
 * aucun aperçu de lien ne va deviner qu'il faut l'appeler puis décoder du
 * base64. Constaté sur GMGN, qui affiche une pastille grise à la place du logo.
 *
 * Ce que la chaîne garantit, cette route le traduit : une URL stable, un
 * content-type, des octets.
 *
 * Mise en cache sans réserve, et c'est justifié plutôt que commode :
 * `metadataURI` est écrit une fois dans le constructeur et n'a pas de setter.
 * Le contenu de cette réponse ne peut donc pas changer — jamais, pas seulement
 * « rarement ».
 */
export const revalidate = false;

const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isDeployed) return new Response("No launcher deployed", { status: 503 });
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return new Response("Not an address", { status: 400 });
  }

  let uri: string;
  try {
    uri = await publicClient.readContract({
      address: address as `0x${string}`,
      abi: tokenAbi,
      functionName: "metadataURI",
    });
  } catch {
    // Une adresse qui ne répond pas à `metadataURI` n'est pas un token Reveal.
    return new Response("Not a Reveal token", { status: 404 });
  }

  /**
   * Le même assainissement que l'interface, volontairement.
   *
   * `metadataURI` est écrit par qui lance le token. Servir son contenu depuis
   * *notre* domaine sans le filtrer reviendrait à lui prêter notre origine :
   * un SVG hostile ou un type MIME inventé deviendraient
   * `launchonreveal.com/...`. On ne sert donc que ce qu'on accepterait
   * d'afficher.
   */
  const meta = parseMetadata(uri);
  if (!meta?.image) return new Response("No image", { status: 404 });

  const [, mime, body] = meta.image.match(/^data:([^;]+);base64,(.+)$/) ?? [];
  if (!mime || !body) return new Response("No image", { status: 404 });

  const bytes = Buffer.from(body, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": mime,
      "content-length": String(bytes.length),
      "cache-control": IMMUTABLE,
      // Le logo est fait pour être repris ailleurs : c'est tout l'objet.
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
      "x-reveal-launcher": LAUNCHER_ADDRESS,
    },
  });
}
