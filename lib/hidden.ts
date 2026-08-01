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
 * décision qu'on assume s'écrit là où elle se vérifie. Deux motifs seulement y
 * figurent — l'usurpation d'identité du launchpad, et nos propres essais. Un
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

  /**
   * Nos essais, retirés de la vitrine mais pas de la chaîne.
   *
   * Ils ont servi à vérifier le partage des frais, l'épinglage IPFS et la carte
   * de partage. Les laisser en tête d'une liste vide donnerait à croire à une
   * activité qui n'existe pas — et deux Hedgehog suivis de trois SuitDog se
   * lisent comme un launchpad cassé plutôt que comme un launchpad neuf.
   *
   * Ce que ce retrait ne fait pas : rien sur la chaîne. Les pools tournent, les
   * pages de ces tokens continuent de répondre, et qui en détient peut vendre
   * exactement comme avant. Le dire ici plutôt que de laisser croire à une
   * suppression.
   */
  ...[
    "0x51fE0e64c370B7466a14E3cC397e2344842CBCF2",
    "0xAd8038B252D471e2646713EdBed148694ec5E51f",
    "0x5d4CDEFCDA9e9c48FaaB59A1bfe9ad28185077b7",
    "0x52418637B35b6c10402920973382e7551A99d71b",
    "0xA2876fc78a191F7592B2200CD528e84fDc4F50d9",
  ].map((address) => ({
    address,
    reason:
      "A test launch by the team, kept off the list until launches open properly.",
  })),
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
