import type { Metadata } from "next";

import { Shell } from "@/components/site/shell";
import { TokenDetail } from "@/components/site/token-detail";
import { activeChain, isDeployed, publicClient, siteUrl } from "@/lib/chain";
import { tokenAbi } from "@/lib/launcher";
import { parseMetadata } from "@/lib/metadata";
import { isHidden } from "@/lib/hidden";

const FALLBACK: Metadata = {
  title: "Token — Reveal",
  description:
    "Live pool state and launch rules for a token deployed through Reveal.",
};

/**
 * L'aperçu du lien, construit depuis la chaîne.
 *
 * Un lancement se partage sur X et sur Telegram avant d'être cherché : la carte
 * qui s'y affiche est souvent la première chose qu'on voit du token. Elle
 * portait le titre générique du site pour tous, ce qui rendait deux lancements
 * indiscernables — et n'affichait aucun logo, puisque celui-ci vit dans un data
 * URI qu'aucun robot d'aperçu ne sait aller chercher.
 *
 * L'image pointe donc sur `/api/token/…/image`, qui décode le contrat et sert
 * de vrais octets sous une vraie URL.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;

  if (!isDeployed || !/^0x[0-9a-fA-F]{40}$/.test(address)) return FALLBACK;
  // Un token retiré du site ne doit pas revenir par la porte de l'aperçu.
  if (isHidden(address)) return FALLBACK;

  try {
    const base = { address: address as `0x${string}`, abi: tokenAbi } as const;
    const [name, symbol, uri] = await Promise.all([
      publicClient.readContract({ ...base, functionName: "name" }),
      publicClient.readContract({ ...base, functionName: "symbol" }),
      publicClient.readContract({ ...base, functionName: "metadataURI" }),
    ]);

    const meta = parseMetadata(uri);
    const title = `${name} (${symbol}) — Reveal`;
    const description =
      meta?.description ??
      `${symbol} on ${activeChain.name}: a tenth sellable at once, all of it after fifteen minutes.`;
    const image = meta?.image
      ? `${siteUrl()}/api/token/${address}/image`
      : undefined;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${siteUrl()}/token/${address}`,
        ...(image ? { images: [{ url: image }] } : {}),
      },
      /**
       * `summary` quand il y a un logo, et non `summary_large_image` : ce que
       * porte le contrat est une vignette carrée de 256 px. Annoncer une grande
       * image la ferait étirer sur toute la largeur de la carte.
       */
      twitter: {
        card: image ? "summary" : "summary_large_image",
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    // Un nœud muet ne doit pas empêcher la page de se rendre : elle relit tout
    // côté client de toute façon.
    return FALLBACK;
  }
}

/**
 * Le segment est l'adresse du contrat, pas un nom : deux tokens peuvent
 * s'appeler pareil, et rien hors de la chaîne ne fait autorité sur un nom.
 *
 * La page est rendue côté client parce qu'il n'y a rien à préparer : tout vient
 * de la chaîne, et le prix change à chaque bloc. Un rendu serveur mis en cache
 * afficherait un prix périmé.
 */
export default async function TokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return (
    <Shell>
      <TokenDetail slug={address} />
    </Shell>
  );
}
