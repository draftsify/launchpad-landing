// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV2Factory, IUniswapV2Pair, IWETH} from "./interfaces/IUniswapV2.sol";
import {Rules, RevealRules} from "./libraries/RevealRules.sol";
import {RevealToken} from "./RevealToken.sol";

/**
 * Point d'entrée d'un lancement. Déploie le token, monte le pool Uniswap V2,
 * y verse toute la supply avec la liquidité du créateur, brûle les parts de LP,
 * puis arme les règles.
 *
 * La liquidité initiale est la même pour tous : c'est l'échelle contre laquelle
 * chaque plafond d'impact se mesure, la laisser varier rendrait « 1 % du pool »
 * incomparable d'un token à l'autre.
 */
contract RevealLauncher {
    /// Les parts de LP y sont envoyées : personne ne peut retirer la liquidité.
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    IUniswapV2Factory public immutable ammFactory;
    IWETH public immutable weth;
    uint256 public immutable launchLiquidity;

    address[] public tokens;

    event Launched(
        address indexed token,
        address indexed creator,
        address pair,
        string name,
        string symbol,
        uint256 supply,
        uint256 liquidity,
        Rules rules
    );

    error WrongLiquidity(uint256 expected);
    error SupplyOutOfRange();
    error PairAlreadyExists();

    constructor(address ammFactory_, address weth_, uint256 launchLiquidity_) {
        ammFactory = IUniswapV2Factory(ammFactory_);
        weth = IWETH(weth_);
        launchLiquidity = launchLiquidity_;
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /**
     * Un seul appel, une seule transaction : à aucun moment le token n'existe
     * sans son pool, donc il n'y a pas de fenêtre où quelqu'un pourrait créer
     * une paire concurrente ou acheter avant que les règles soient armées.
     */
    function launch(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        Rules calldata rules
    ) external payable returns (address token, address pair) {
        if (msg.value != launchLiquidity) revert WrongLiquidity(launchLiquidity);
        if (supply < 1e18 || supply > 1e36) revert SupplyOutOfRange();

        // `validate` tourne aussi dans le constructeur du token ; ici elle évite
        // de déployer quoi que ce soit quand les règles sont invalides.
        RevealRules.validate(rules);

        RevealToken deployed = new RevealToken(name, symbol, supply, rules);
        token = address(deployed);

        if (ammFactory.getPair(token, address(weth)) != address(0)) revert PairAlreadyExists();
        pair = ammFactory.createPair(token, address(weth));

        // Tout part au pool avant `initialize` : la phase d'amorçage est la
        // seule où les transferts sont libres.
        deployed.transfer(pair, supply);
        weth.deposit{value: msg.value}();
        weth.transfer(pair, msg.value);
        IUniswapV2Pair(pair).mint(BURN);

        deployed.initialize(pair);
        tokens.push(token);

        emit Launched(
            token, msg.sender, pair, name, symbol, supply, msg.value, rules
        );
    }
}
