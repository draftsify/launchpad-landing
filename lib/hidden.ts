/**
 * Tokens que ce site ne liste pas.
 *
 * À lire pour ce que c'est : une décision éditoriale d'une interface, pas une
 * propriété du protocole. Le launcher n'a ni propriétaire ni administrateur, et
 * personne — nous compris — ne peut supprimer un token, fermer son pool ou
 * empêcher qui que ce soit de l'échanger par contrat direct ou depuis une autre
 * interface. Masquer ici ne fait pas disparaître, et prétendre le contraire
 * serait mentir aux gens qui détiennent ce token.
 *
 * La liste est donc versionnée, en clair, avec un motif par entrée : une
 * décision qu'on assume s'écrit là où elle se vérifie. Elle reste volontairement
 * étroite — l'usurpation d'identité du launchpad lui-même, rien d'autre. Un
 * launchpad qui filtre selon ses goûts a cessé d'être neutre, et sa promesse de
 * découverte des prix avec.
 */
export const HIDDEN: { address: string; reason: string }[] = [
  {
    // Lancé quelques minutes après l'ouverture des créations, sous le nom et le
    // symbole du launchpad lui-même, par une adresse sans rapport avec le
    // projet. Un visiteur ne peut pas le distinguer d'un token officiel.
    address: "0x7416f459608a26270930d282a5393bcf1d2c849c",
    reason:
      "It launched under the launchpad's own name and symbol, from an address unconnected to the project.",
  },
];

/**
 * Tokens dont on n'affiche pas les liens, sans les retirer de la liste.
 *
 * Plus étroit que `HIDDEN` et c'est le but : un lien qui n'aide personne ne
 * justifie pas de faire disparaître un lancement. Le document reste dans le
 * contrat et reste lisible par n'importe qui — on choisit seulement de ne pas
 * le mettre en avant ici.
 */
export const LINKS_MUTED: { address: string; reason: string }[] = [
  {
    // Le champ `website` porte une URL de recherche X, pas un site. Affichée,
    // elle ressemble à un lien officiel et ne mène nulle part d'utile.
    address: "0xbc4fa88617dd5dfe2efeaa4a11f233acde6af672",
    reason: "Search URL rather than a site",
  },
];

const MUTED = new Set(LINKS_MUTED.map((m) => m.address.toLowerCase()));

/** Vrai quand les liens de ce token ne doivent pas être affichés. */
export function linksMuted(address: string) {
  return MUTED.has(address.toLowerCase());
}

const BY_ADDRESS = new Map(
  HIDDEN.map((h) => [h.address.toLowerCase(), h.reason] as const)
);

export function isHidden(address: string) {
  return BY_ADDRESS.has(address.toLowerCase());
}

/** Le motif, ou `null`. Affiché tel quel : c'est ce qui rend le retrait vérifiable. */
export function hiddenReason(address: string) {
  return BY_ADDRESS.get(address.toLowerCase()) ?? null;
}
