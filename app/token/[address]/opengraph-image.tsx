import { ImageResponse } from "next/og";
import sharp from "sharp";

import { activeChain, isDeployed, publicClient, siteUrl } from "@/lib/chain";
import { tokenAbi } from "@/lib/launcher";
import { ipfsCid, parseMetadata } from "@/lib/metadata";
import { isHidden } from "@/lib/hidden";

/**
 * La carte d'aperçu d'un lancement, dessinée ici plutôt que servie telle quelle.
 *
 * Ce qui la rend nécessaire : la vignette du contrat est un WebP de 256 px.
 * X sait l'afficher, Facebook et Telegram non — leurs robots d'aperçu ne
 * décodent que JPEG, PNG et GIF. Un lien partagé sur Telegram, c'est-à-dire là
 * où ces lancements circulent le plus, arrivait donc sans image alors que
 * l'image existait. On rastérise en PNG, format que personne ne refuse.
 *
 * Le second gain est la forme : 256 px carrés dans une carte prévue pour
 * 1200x630 donnent une pastille perdue dans du vide. La carte porte maintenant
 * le logo, le nom, le symbole et la règle qui distingue ce launchpad — de quoi
 * comprendre ce qu'on ouvre avant de l'ouvrir.
 */
export const runtime = "nodejs";
export const revalidate = false;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A token launched on Reveal";

/** Reprend les tons du site : le fond, la bordure, le texte secondaire. */
const BG = "#0a0a0a";
const BORDER = "#1f1f1f";
const MUTED = "#a1a1a1";

/**
 * Convertit la vignette en PNG pour satori.
 *
 * Le décodeur de satori ne connaît ni WebP ni les data URI exotiques : lui
 * passer directement ce que porte le contrat fait échouer le rendu entier, donc
 * la carte, donc l'aperçu. sharp décode ce que le navigateur a encodé, quel que
 * soit le format qu'il a choisi, et rend des octets que satori accepte.
 */
async function toPngFromBytes(input: Buffer): Promise<string | null> {
  try {
    const png = await sharp(input)
      // 440 plutôt que 256 : la carte affiche 220 px CSS, et un écran à deux
      // fois la densité les rend en 440 pixels réels.
      .resize(440, 440, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // Une image illisible ne doit pas coûter la carte : on la dessine sans.
    return null;
  }
}

async function toPng(dataUri: string): Promise<string | null> {
  const [, body] = dataUri.match(/^data:[^;]+;base64,(.+)$/) ?? [];
  if (!body) return null;
  return toPngFromBytes(Buffer.from(body, "base64"));
}

export default async function Image({
  params,
}: {
  params: { address: string };
}) {
  const { address } = params;

  let name = "Reveal";
  let symbol = "";
  let logo: string | null = null;

  if (isDeployed && /^0x[0-9a-fA-F]{40}$/.test(address) && !isHidden(address)) {
    try {
      const base = { address: address as `0x${string}`, abi: tokenAbi } as const;
      const [onChainName, onChainSymbol, uri] = await Promise.all([
        publicClient.readContract({ ...base, functionName: "name" }),
        publicClient.readContract({ ...base, functionName: "symbol" }),
        publicClient.readContract({ ...base, functionName: "metadataURI" }),
      ]);
      name = onChainName;
      symbol = onChainSymbol;
      const meta = parseMetadata(uri);
      /**
       * L'original d'IPFS quand il existe, la vignette sinon.
       *
       * Cette carte fait 1200 px de large : 256 px agrandis y sont visiblement
       * mous. Le CID est résolu par notre propre passerelle, qui borne le type
       * et la taille — et si elle ne répond pas, la vignette de la chaîne prend
       * le relais plutôt que de laisser une carte sans logo.
       */
      const cid = ipfsCid(meta?.image);
      if (cid) {
        try {
          const response = await fetch(`${siteUrl()}/api/ipfs/${cid}`, {
            signal: AbortSignal.timeout(6_000),
          });
          if (response.ok) {
            logo = await toPngFromBytes(Buffer.from(await response.arrayBuffer()));
          }
        } catch {
          // Passerelle muette : on retombe sur la vignette, juste en dessous.
        }
      }
      if (!logo && meta?.thumbnail) logo = await toPng(meta.thumbnail);
    } catch {
      // Un nœud muet rend une carte générique plutôt qu'une erreur : un aperçu
      // manquant se remarque plus qu'un aperçu sobre.
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          color: "#fafafa",
          padding: 72,
        }}
      >
        {/* Le bloc du token occupe la hauteur libre et se centre dedans : posé
            en haut, il laissait un tiers de la carte vide sous lui. */}
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
            gap: 36,
          }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              width={220}
              height={220}
              alt=""
              style={{ borderRadius: 40, border: `1px solid ${BORDER}` }}
            />
          ) : (
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: 40,
                border: `1px solid ${BORDER}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 88,
                color: MUTED,
              }}
            >
              {(symbol || "R").slice(0, 3)}
            </div>
          )}

          {/* satori exige un `display` explicite sur tout élément à plusieurs
              enfants : il n'a pas de valeur par défaut comme un navigateur, et
              l'omission fait échouer le rendu entier plutôt qu'un seul bloc. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex",
                fontSize: 76,
                letterSpacing: -2,
                lineHeight: 1.05,
              }}
            >
              {name}
            </div>
            {symbol ? (
              <div style={{ display: "flex", fontSize: 40, color: MUTED }}>
                {`$${symbol}`}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 28,
            // 28 px faisait tenir les deux lignes sur 1204 px pour 1200
            // disponibles : elles se touchaient, sans espace ni coupure.
            fontSize: 26,
            gap: 40,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>
            A tenth sellable at launch, all of it after fifteen minutes.
          </div>
          <div style={{ display: "flex", color: "#fafafa" }}>
            {`Reveal · ${activeChain.name}`}
          </div>
        </div>
      </div>
    ),
    size
  );
}
