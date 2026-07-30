export type Rules = {
  /** Part vendable dès le premier bloc, en %. */
  initialUnlock: number;
  /** Durée jusqu'au déblocage complet, en heures. */
  unlockHours: number;
  /** Plafond de vente par fenêtre, en % de la réserve du pool. */
  impactCap: number;
  /** Fenêtre du plafond, en minutes. */
  impactWindow: number;
  /** Délai avant le premier achat, en secondes. */
  launchDelay: number;
  /** Montée progressive de la taille d'achat, en minutes. */
  buyRamp: number;
};

/**
 * Règles du protocole, identiques pour tout lancement et non modifiables.
 *
 * Elles ne sont pas un réglage du créateur : laisser chacun choisir combien il
 * se contraint revient à ne pas le contraindre, et rend deux tokens
 * incomparables. Elles vivent dans le launcher, qui n'a aucune fonction pour
 * les changer.
 *
 * Ces valeurs-ci sont celles que `script/Deploy.s.sol` inscrit dans le
 * launcher. Elles servent aux pages qui décrivent le protocole sans viser un
 * déploiement, et de première réponse le temps que la chaîne réponde — mais
 * c'est `useRules()` qui a le dernier mot dès qu'un launcher existe, parce que
 * c'est le contrat qui applique, pas ce fichier.
 */
export const RULES: Rules = {
  initialUnlock: 10,
  unlockHours: 1,
  impactCap: 10,
  impactWindow: 5,
  launchDelay: 5,
  buyRamp: 10,
};

export function formatDuration(hours: number) {
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24}d`;
  return `${hours}h`;
}
