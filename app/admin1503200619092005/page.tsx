import type { Metadata } from "next";

import { Shell } from "@/components/site/shell";
import { TreasuryConsole } from "@/components/site/treasury-console";

/**
 * La console de trésorerie, à une adresse qu'on ne trouve pas en cherchant.
 *
 * `noindex, nofollow` parce qu'une adresse obscure référencée par un moteur
 * cesse d'être obscure. Elle n'est liée depuis aucune page du site, ne figure
 * pas dans la navigation, et rien ne pointe vers elle.
 *
 * Ce que cette page ne fait pas : protéger des fonds. `collect` est
 * permissionless dans le locker et paie toujours l'adresse gravée dans son
 * constructeur ; le reste exige une signature. L'obscurité de l'URL évite une
 * découverte fortuite, elle ne tient lieu de rien d'autre.
 */
export const metadata: Metadata = {
  title: "Treasury — Reveal",
  robots: { index: false, follow: false },
};

export default function TreasuryPage() {
  return (
    <Shell>
      <TreasuryConsole />
    </Shell>
  );
}
