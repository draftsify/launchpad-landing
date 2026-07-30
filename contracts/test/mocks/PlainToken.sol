// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * ERC-20 sans aucune règle, pour le pool de référence des tests différentiels.
 *
 * C'est le témoin de l'expérience : même supply, même palier, mêmes ticks, même
 * liquidité que le lancement Reveal, mais pas un seul hook de transfert. Si les
 * deux courbes de prix coïncident, c'est que les restrictions de Reveal ne
 * déforment pas l'exécution — elles la refusent ou la laissent passer, sans
 * jamais la changer.
 */
contract PlainToken is ERC20 {
    constructor(uint256 supply) ERC20("Plain", "PLAIN") {
        _mint(msg.sender, supply);
    }
}
