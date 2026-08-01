// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealToken} from "./RevealToken.sol";
import {Rules} from "./libraries/RevealRules.sol";
import {LaunchMeta} from "./RevealTypes.sol";

/**
 * Fabrique les tokens, pour que le launcher n'ait pas à porter leur code.
 *
 * Ce contrat n'existe que pour une contrainte de l'EVM : le code de création
 * d'un contrat est embarqué dans celui qui l'instancie, et `RevealLauncher`
 * atteignait 24 526 octets sur les 24 576 autorisés — cinquante d'écart. Sortir
 * `new RevealToken(...)` d'ici lui rend les huit kilo-octets du token.
 *
 * Ce qu'il n'ajoute pas : le moindre pouvoir. Il n'a ni propriétaire, ni pause,
 * ni fonction d'écriture au-delà de l'attache unique ci-dessous ; il ne détient
 * jamais de tokens, puisque la frappe va directement au launcher ; et il refuse
 * tout appelant qui ne serait pas ce launcher. Un tiers ne peut donc pas s'en
 * servir pour fabriquer un token qui se réclamerait de Reveal.
 */
contract RevealTokenFactory {
    /**
     * L'adresse qui a déployé la fabrique, et la seule qui puisse l'attacher.
     *
     * Le launcher ne peut pas être passé au constructeur : il a besoin de
     * l'adresse de la fabrique pour être construit, donc l'un des deux existe
     * forcément avant l'autre. L'attache est faite une fois, dans la même
     * transaction que le déploiement, par le script versionné.
     */
    address public immutable admin;

    /// Écrit une fois. Aucun chemin ne le remet à zéro.
    address public launcher;

    error NotAdmin();
    error AlreadyAttached();
    error NotLauncher();

    event Attached(address indexed launcher);

    constructor() {
        admin = msg.sender;
    }

    function attach(address launcher_) external {
        if (msg.sender != admin) revert NotAdmin();
        if (launcher != address(0)) revert AlreadyAttached();
        launcher = launcher_;
        emit Attached(launcher_);
    }

    /**
     * Déploie un token dont le launcher est l'appelant.
     *
     * L'appelant est vérifié plutôt que déduit : `RevealToken` reçoit son
     * launcher en argument, donc sans ce contrôle n'importe qui pourrait
     * fabriquer un token pointant sur notre launcher. Il serait inerte — seul
     * le launcher peut l'initialiser, et sans initialisation il n'a ni pool ni
     * règles armées — mais il porterait notre nom, et c'est déjà trop.
     */
    function deploy(
        string calldata name,
        string calldata symbol,
        LaunchMeta calldata meta,
        uint256 supply,
        Rules calldata rules
    ) external returns (RevealToken token) {
        if (msg.sender != launcher) revert NotLauncher();
        token = new RevealToken(msg.sender, name, symbol, meta, supply, rules);
    }
}
