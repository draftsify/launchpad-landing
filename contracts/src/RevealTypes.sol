// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Les métadonnées d'un lancement, dans la forme que cette chaîne interroge.
 *
 * Ces deux structures ne sont pas de notre invention : ce sont celles du
 * launchpad dominant de Robinhood Chain, reprises champ pour champ et dans le
 * même ordre. Mesuré sur la chaîne avant de les écrire — onze tokens y
 * répondent à `logo()`, `description()` et `socials()`, et l'outillage qui
 * affiche cette chaîne a été écrit contre eux.
 *
 * Pourquoi copier plutôt que proposer mieux : un format n'a de valeur que s'il
 * est lu. `metadataURI()` est plus complet — il porte la vignette dans le
 * contrat, donc sans dépendre d'IPFS ni d'un serveur — mais c'est un nom que
 * nous avons inventé, et personne d'autre ne l'appellera jamais. Les deux
 * coexistent : le nôtre pour la permanence, celui-ci pour être trouvé.
 */
struct Socials {
    string telegram;
    string twitter;
    string discord;
    string website;
    string farcaster;
}

struct TokenInfo {
    address deployer;
    string logo;
    string description;
    Socials socials;
}

/**
 * Ce qu'un lancement écrit, en un seul argument.
 *
 * Groupé plutôt qu'étalé en six paramètres, et pour une raison mécanique : le
 * launcher frôle la limite de taille de l'EVM, et chaque signature de fonction
 * publique y coûte du bytecode.
 */
struct LaunchMeta {
    /// Le document complet, écrit dans le contrat. Voir `RevealToken.metadataURI`.
    string uri;
    /// `ipfs://<cid>` de l'image d'origine.
    string logo;
    string description;
    Socials socials;
}
