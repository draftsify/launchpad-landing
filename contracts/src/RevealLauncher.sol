// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV2Factory, IUniswapV2Pair, IWETH} from "./interfaces/IUniswapV2.sol";
import {Rules, RevealRules} from "./libraries/RevealRules.sol";
import {RevealToken} from "./RevealToken.sol";

/**
 * Point d'entrée d'un lancement. Déploie le token, monte le pool Uniswap V2,
 * y verse toute la supply avec la liquidité, brûle les parts de LP, puis arme
 * les règles. Le créateur ne paie que le gas.
 *
 * La liquidité vient de la trésorerie de ce contrat, que n'importe qui peut
 * abonder et que personne ne peut retirer : elle ne sort que vers un pool dont
 * les LP sont brûlées. Il n'y a donc aucune clé d'administration sur les fonds.
 *
 * Ce que ça expose, et qu'il faut nommer : la trésorerie est **gaspillable, pas
 * volable**. Un lancement met la liquidité face à la supply entière et brûle les
 * LP ; le lanceur ne reçoit aucun token, et extraire de l'ETH du pool suppose
 * d'en avoir injecté d'abord. Le risque est l'épuisement du capital, pas le vol.
 * D'où un budget par fenêtre glissante, qui borne les dégâts d'un spammeur sans
 * imposer de frais au créateur.
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

    /// Plafond de dépense de la trésorerie sur une fenêtre glissante.
    uint256 public immutable budgetPerWindow;
    uint32 public immutable budgetWindow;

    uint256 public spentInWindow;
    uint64 public spentAt;

    address[] public tokens;

    event Launched(
        address indexed token,
        address indexed creator,
        address pair,
        string name,
        string symbol,
        string metadataURI,
        uint256 supply,
        uint256 liquidity,
        Rules rules
    );
    event Funded(address indexed from, uint256 amount, uint256 balance);

    error SupplyOutOfRange();
    error PairAlreadyExists();
    error TreasuryEmpty(uint256 available, uint256 needed);
    error BudgetExhausted(uint256 remaining);
    error BadConfiguration();

    constructor(
        address ammFactory_,
        address weth_,
        uint256 launchLiquidity_,
        uint256 budgetPerWindow_,
        uint32 budgetWindow_
    ) {
        // Un budget inférieur à un lancement bloquerait tout, et une fenêtre
        // nulle diviserait par zéro dans l'amortissement.
        if (
            launchLiquidity_ == 0 || budgetPerWindow_ < launchLiquidity_
                || budgetWindow_ == 0
        ) revert BadConfiguration();

        ammFactory = IUniswapV2Factory(ammFactory_);
        weth = IWETH(weth_);
        launchLiquidity = launchLiquidity_;
        budgetPerWindow = budgetPerWindow_;
        budgetWindow = budgetWindow_;
    }

    /// Abonder est ouvert à tous ; il n'existe aucune fonction de retrait.
    receive() external payable {
        emit Funded(msg.sender, msg.value, address(this).balance);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function treasury() external view returns (uint256) {
        return address(this).balance;
    }

    /// Ce que la fenêtre laisse encore financer à cet instant.
    function budgetRemaining() public view returns (uint256) {
        uint256 spent =
            RevealRules.decayed(spentInWindow, block.timestamp - spentAt, budgetWindow);
        return spent >= budgetPerWindow ? 0 : budgetPerWindow - spent;
    }

    /// Vrai si un lancement passerait maintenant : l'interface interroge ceci
    /// plutôt que de laisser un créateur payer du gas pour un revert.
    function canLaunch() external view returns (bool) {
        return address(this).balance >= launchLiquidity
            && budgetRemaining() >= launchLiquidity;
    }

    /**
     * Débite la fenêtre. Seau percé, même primitive que le plafond d'impact :
     * la dépense s'efface progressivement au lieu de repartir à zéro sur une
     * frontière, sinon dix lancements de plus passeraient à minuit pile.
     */
    function _spendBudget() private {
        uint256 available = address(this).balance;
        if (available < launchLiquidity) revert TreasuryEmpty(available, launchLiquidity);

        uint256 spent =
            RevealRules.decayed(spentInWindow, block.timestamp - spentAt, budgetWindow);
        if (spent + launchLiquidity > budgetPerWindow) {
            revert BudgetExhausted(budgetPerWindow > spent ? budgetPerWindow - spent : 0);
        }

        spentInWindow = spent + launchLiquidity;
        spentAt = uint64(block.timestamp);
    }

    /**
     * Un seul appel, une seule transaction : à aucun moment le token n'existe
     * sans son pool, donc il n'y a pas de fenêtre où quelqu'un pourrait créer
     * une paire concurrente ou acheter avant que les règles soient armées.
     */
    function launch(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 supply,
        Rules calldata rules
    ) external returns (address token, address pair) {
        if (supply < 1e18 || supply > 1e36) revert SupplyOutOfRange();
        _spendBudget();

        // `validate` tourne aussi dans le constructeur du token ; ici elle évite
        // de déployer quoi que ce soit quand les règles sont invalides.
        RevealRules.validate(rules);

        RevealToken deployed = new RevealToken(name, symbol, metadataURI, supply, rules);
        token = address(deployed);

        if (ammFactory.getPair(token, address(weth)) != address(0)) revert PairAlreadyExists();
        pair = ammFactory.createPair(token, address(weth));

        // Tout part au pool avant `initialize` : la phase d'amorçage est la
        // seule où les transferts sont libres.
        deployed.transfer(pair, supply);
        weth.deposit{value: launchLiquidity}();
        weth.transfer(pair, launchLiquidity);
        IUniswapV2Pair(pair).mint(BURN);

        deployed.initialize(pair);
        tokens.push(token);

        emit Launched(
            token,
            msg.sender,
            pair,
            name,
            symbol,
            metadataURI,
            supply,
            launchLiquidity,
            rules
        );
    }
}
