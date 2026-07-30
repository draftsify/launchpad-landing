import type { Metadata } from "next";

import { Shell } from "@/components/site/shell";
import { TokenDetail } from "@/components/site/token-detail";

export const metadata: Metadata = {
  title: "Token — Reveal",
  description:
    "Live pool state and launch rules for a token deployed through Reveal.",
};

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
