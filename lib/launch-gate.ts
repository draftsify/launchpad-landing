/**
 * Les lancements sont-ils ouverts au public ?
 *
 * Fermé par défaut, et volontairement indépendant de `isDeployed` : un launcher
 * peut très bien exister sur la chaîne — pour un test, une répétition, une
 * vérification — sans que Reveal soit ouvert. Confondre les deux ferait ouvrir
 * le lancement au public à la seconde où un contrat de test touche la chaîne.
 *
 * Ce n'est pas un contrôle d'accès : le launcher est permissionless, et qui sait
 * lire un ABI peut l'appeler directement. C'est une porte d'interface, qui dit
 * ce que le projet propose aujourd'hui plutôt que d'offrir un bouton menant à
 * une transaction que personne n'a annoncée.
 *
 * Pour ouvrir : NEXT_PUBLIC_LAUNCHES_OPEN=true
 */
export const launchesOpen = process.env.NEXT_PUBLIC_LAUNCHES_OPEN === "true";
