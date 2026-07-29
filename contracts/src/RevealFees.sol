// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";

/**
 * Propriétaire des positions de liquidité, et seule voie par laquelle quoi que
 * ce soit peut en sortir.
 *
 * Une position v3 accumule les frais de swap au profit de son propriétaire.
 * Ouverte au nom de `0xdEaD`, elle verrouille la liquidité — mais enterre aussi
 * les frais avec elle. Ce contrat la détient à la place, et n'expose qu'un seul
 * geste : `burn(lower, upper, 0)`.
 *
 * Le zéro est écrit en dur et n'est jamais un paramètre. Dans v3, `burn` à zéro
 * matérialise les frais dus sans toucher à la liquidité ; c'est un montant non
 * nul qui la retirerait, et aucun chemin de ce contrat ne peut en produire un.
 * La liquidité est donc aussi bloquée qu'avec `0xdEaD`, les frais ne le sont
 * plus.
 *
 * `collect` est ouvert à tous et verse toujours à la trésorerie : personne n'a
 * besoin d'une clé pour l'actionner, et personne ne peut détourner la
 * destination. Le contrat ne détient jamais les fonds — le pool les envoie
 * directement.
 */
contract RevealFees {
    /// Destinataire, fixé au déploiement et non modifiable.
    address public immutable treasury;
    /// Seul autorisé à enregistrer une position : le launcher qui l'a créée.
    address public immutable launcher;

    struct Position {
        address pool;
        int24 tickLower;
        int24 tickUpper;
    }

    mapping(address token => Position) public positions;

    event Registered(address indexed token, address pool, int24 tickLower, int24 tickUpper);
    event Collected(address indexed token, uint256 amount0, uint256 amount1);

    error OnlyLauncher();
    error AlreadyRegistered();
    error UnknownToken();
    error NoTreasury();

    constructor(address treasury_) {
        if (treasury_ == address(0)) revert NoTreasury();
        treasury = treasury_;
        launcher = msg.sender;
    }

    function register(address token, address pool, int24 tickLower, int24 tickUpper)
        external
    {
        if (msg.sender != launcher) revert OnlyLauncher();
        if (positions[token].pool != address(0)) revert AlreadyRegistered();

        positions[token] = Position(pool, tickLower, tickUpper);
        emit Registered(token, pool, tickLower, tickUpper);
    }

    /// Récupère les frais accumulés. Appelable par n'importe qui, sans effet
    /// sur la liquidité, et toujours au profit de la trésorerie.
    function collect(address token) external returns (uint256 amount0, uint256 amount1) {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();

        // Zéro en dur : matérialise les frais dus, ne retire aucune liquidité.
        IUniswapV3Pool(p.pool).burn(p.tickLower, p.tickUpper, 0);

        (amount0, amount1) = IUniswapV3Pool(p.pool).collect(
            treasury, p.tickLower, p.tickUpper, type(uint128).max, type(uint128).max
        );
        emit Collected(token, amount0, amount1);
    }

    /// Ce que `collect` rendrait, sans l'exécuter.
    function owed(address token) external returns (uint128 amount0, uint128 amount1) {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();

        IUniswapV3Pool(p.pool).burn(p.tickLower, p.tickUpper, 0);
        (,,, amount0, amount1) = IUniswapV3Pool(p.pool).positions(
            keccak256(abi.encodePacked(address(this), p.tickLower, p.tickUpper))
        );
    }
}
