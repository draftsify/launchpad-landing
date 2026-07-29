// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {
    IUniswapV3Factory, IUniswapV3MintCallback, IUniswapV3Pool
} from "./interfaces/IUniswapV3.sol";
import {Rules, RevealRules} from "./libraries/RevealRules.sol";
import {RevealToken} from "./RevealToken.sol";

/**
 * Point d'entrée d'un lancement. Déploie le token, crée son pool Uniswap V3,
 * y place la supply entière en liquidité **unilatérale**, verrouille la
 * position, puis arme les règles.
 *
 * Unilatéral veut dire : toute la supply est posée dans une plage de ticks
 * située au-dessus du prix de départ, donc la position est à 100 % en tokens et
 * à 0 % en quote. Personne n'avance de capital — ni le créateur, ni le
 * protocole. Ce sont les achats qui constituent la liquidité, en poussant le
 * prix à travers la plage. C'est ce que Uniswap V2 ne sait pas faire : il exige
 * les deux côtés.
 *
 * La position est ouverte au nom de `BURN`. Dans v3 une position appartient à
 * (owner, tickLower, tickUpper) : personne d'autre que cette adresse ne peut
 * appeler `burn` ni `collect`, donc ni la liquidité ni les frais accumulés ne
 * sortiront jamais.
 */
contract RevealLauncher is IUniswapV3MintCallback {
    uint256 private constant Q96 = 1 << 96;
    /// Propriétaire de la position : sans clé, donc sans retrait possible.
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    /**
     * Plage de la position. Deux jeux sont nécessaires parce que l'ordre des
     * tokens dans une paire dépend de leurs adresses, et que le prix s'inverse
     * avec lui.
     */
    struct Range {
        int24 tickLower;
        int24 tickUpper;
        uint160 sqrtLower;
        uint160 sqrtUpper;
    }

    IUniswapV3Factory public immutable ammFactory;
    address public immutable quote;
    uint24 public immutable fee;
    uint16 public immutable observationCardinality;

    Range public rangeIfToken0;
    Range public rangeIfToken1;

    address[] public tokens;
    /// Renseigné le temps d'un `mint`, pour authentifier le rappel.
    address private minting;

    /**
     * `name`, `symbol` et `metadataURI` ne sont pas répétés ici : ils se lisent
     * sur le token, et les inclure saturait la pile du compilateur. Un indexeur
     * les récupère par appel au moment où il traite l'événement.
     */
    event Launched(
        address indexed token,
        address indexed creator,
        address pool,
        uint256 supply,
        int24 tickLower,
        int24 tickUpper,
        Rules rules
    );

    error SupplyOutOfRange();
    error PoolAlreadyExists();
    error BadRange();
    error UnexpectedCallback();
    error NothingMinted();

    constructor(
        address ammFactory_,
        address quote_,
        uint24 fee_,
        uint16 observationCardinality_,
        Range memory rangeIfToken0_,
        Range memory rangeIfToken1_
    ) {
        _check(rangeIfToken0_);
        _check(rangeIfToken1_);

        ammFactory = IUniswapV3Factory(ammFactory_);
        quote = quote_;
        fee = fee_;
        observationCardinality = observationCardinality_;
        rangeIfToken0 = rangeIfToken0_;
        rangeIfToken1 = rangeIfToken1_;
    }

    function _check(Range memory r) private pure {
        if (r.tickLower >= r.tickUpper || r.sqrtLower >= r.sqrtUpper) revert BadRange();
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /**
     * Un seul appel, une seule transaction : à aucun moment le token n'existe
     * sans son pool, donc il n'y a pas de fenêtre où quelqu'un pourrait créer
     * un pool concurrent ou acheter avant que les règles soient armées.
     *
     * Le créateur ne paie que le gas.
     */
    function launch(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 supply,
        Rules calldata rules
    ) external returns (address token, address pool) {
        if (supply < 1e18 || supply > 1e36) revert SupplyOutOfRange();

        // `validate` tourne aussi dans le constructeur du token ; ici elle évite
        // de déployer quoi que ce soit quand les règles sont invalides.
        RevealRules.validate(rules);

        RevealToken deployed = new RevealToken(name, symbol, metadataURI, supply, rules);
        token = address(deployed);

        if (ammFactory.getPool(token, quote, fee) != address(0)) revert PoolAlreadyExists();
        pool = ammFactory.createPool(token, quote, fee);

        Range memory r = _seed(pool, token, supply);

        // Sans cet appel la cardinalité vaut 1 : aucun historique, donc aucun
        // TWAP, donc aucun drawdown relief tant que le pool n'a pas grandi.
        IUniswapV3Pool(pool).increaseObservationCardinalityNext(observationCardinality);

        deployed.initialize(pool, quote);
        tokens.push(token);

        emit Launched(token, msg.sender, pool, supply, r.tickLower, r.tickUpper, rules);
    }

    /**
     * Ouvre le pool au bord de la plage et y verse toute la supply.
     *
     * Le prix initial est exactement celui du bord côté token : v3 calcule
     * alors une quantité nulle de l'autre actif, ce qui est précisément la
     * définition d'une position unilatérale.
     */
    function _seed(address pool, address token, uint256 supply)
        private
        returns (Range memory r)
    {
        bool tokenIsToken0 = IUniswapV3Pool(pool).token0() == token;
        r = tokenIsToken0 ? rangeIfToken0 : rangeIfToken1;

        uint128 liquidity;
        if (tokenIsToken0) {
            // Prix = quote par token : la plage est au-dessus du départ, et
            // acheter fait monter le tick.
            IUniswapV3Pool(pool).initialize(r.sqrtLower);
            uint256 mid = Math.mulDiv(r.sqrtLower, r.sqrtUpper, Q96);
            liquidity = uint128(Math.mulDiv(supply, mid, r.sqrtUpper - r.sqrtLower));
        } else {
            // Prix = tokens par quote : tout s'inverse, acheter fait baisser
            // le tick, et le départ est le bord haut.
            IUniswapV3Pool(pool).initialize(r.sqrtUpper);
            liquidity = uint128(Math.mulDiv(supply, Q96, r.sqrtUpper - r.sqrtLower));
        }

        minting = pool;
        (uint256 used0, uint256 used1) = IUniswapV3Pool(pool).mint(
            BURN, r.tickLower, r.tickUpper, liquidity, abi.encode(token)
        );
        minting = address(0);

        // Un côté doit être nul : sinon la position n'est pas unilatérale et
        // le launcher devrait de la quote qu'il n'a pas.
        if (used0 + used1 == 0) revert NothingMinted();
    }

    /// Le pool réclame ce qu'il vient de créditer. Seul le pool en cours de
    /// `mint` peut appeler, et il n'est jamais dû autre chose que le token.
    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data)
        external
        override
    {
        if (msg.sender != minting || minting == address(0)) revert UnexpectedCallback();

        address token = abi.decode(data, (address));
        uint256 owed = amount0Owed + amount1Owed;
        // Avant `initialize` du token, les transferts sont libres : c'est la
        // seule fenêtre où la supply peut rejoindre le pool.
        RevealToken(token).transfer(msg.sender, owed);
    }
}
