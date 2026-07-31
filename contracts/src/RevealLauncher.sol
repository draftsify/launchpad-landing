// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    IUniswapV3Factory, IUniswapV3Pool
} from "./interfaces/IUniswapV3.sol";
import {INonfungiblePositionManager} from "./interfaces/INonfungiblePositionManager.sol";
import {LiquidityAmounts} from "./libraries/LiquidityAmounts.sol";
import {Rules, RevealRules} from "./libraries/RevealRules.sol";
import {TickMath} from "./libraries/TickMath.sol";
import {RevealLocker} from "./RevealLocker.sol";
import {RevealToken} from "./RevealToken.sol";

/**
 * Point d'entrée d'un lancement. Déploie le token, crée son pool Uniswap V3,
 * y place la supply entière en liquidité **unilatérale** via le
 * NonfungiblePositionManager canonique, envoie le NFT de position au locker,
 * puis arme les règles.
 *
 * Unilatéral veut dire : toute la supply est posée dans une plage située d'un
 * seul côté du prix de départ, donc la position est à 100 % en tokens et à 0 %
 * en quote. Personne n'avance de capital — ni le créateur, ni le protocole. Ce
 * sont les achats qui constituent la liquidité, en poussant le prix à travers
 * la plage.
 *
 * La plage est celle du launchpad dominant de cette chaîne, au tick près, et
 * pour deux raisons. D'abord la parité de courbe : à supply et palier de frais
 * égaux, un même ordre doit déplacer le prix exactement pareil, ce que les
 * tests différentiels vérifient. Ensuite l'étendue : le bord lointain, jamais
 * atteint en pratique, garde le lancement dans le *même* pool après la
 * graduation et évite l'épuisement de plage qu'une fourchette étroite provoque
 * vers 5 ETH.
 *
 * Les prix de départ ne sont plus des paramètres de constructeur calculés hors
 * chaîne : `TickMath` est embarqué, donc n'importe qui peut recalculer le prix
 * initial à partir du seul tick, et le vérifier.
 */
contract RevealLauncher {
    /**
     * Plage vue depuis « notre token est token0 », donc en quote par token :
     * le départ est le bord bas et acheter fait monter le tick.
     */
    int24 public constant TICK_TOKEN0_LOWER = -204_200;
    int24 public constant TICK_TOKEN0_UPPER = 887_200;
    /// La symétrique : le prix s'inverse, le départ est le bord haut.
    int24 public constant TICK_TOKEN1_LOWER = -887_200;
    int24 public constant TICK_TOKEN1_UPPER = 204_200;

    /// Palier 1 %, dont le tick spacing vaut 200 — vérifié sur la factory.
    uint24 public constant FEE = 10_000;
    int24 public constant TICK_SPACING = 200;

    IUniswapV3Factory public immutable ammFactory;
    INonfungiblePositionManager public immutable positionManager;
    /// Propriétaire définitif des positions, déployé ici : son `launcher` est
    /// donc forcément nous, sans dépendance circulaire ni administration.
    RevealLocker public immutable locker;
    address public immutable quote;
    uint16 public immutable observationCardinality;
    /**
     * Supply identique pour tout lancement. Ce n'est pas un choix esthétique :
     * la plage de ticks fixe un prix par token, donc la capitalisation de
     * départ vaut supply × ce prix. Laisser la supply varier ferait varier la
     * capitalisation initiale dans la même proportion — et romprait la parité
     * de courbe que les tests différentiels vérifient.
     */
    uint256 public immutable supply;
    /**
     * Règles identiques pour tout lancement. Les laisser au choix du créateur
     * revenait à laisser chacun choisir combien il se contraint — ce qui n'est
     * plus une contrainte.
     */
    Rules public rules;

    struct Launch {
        address pool;
        uint256 tokenId;
        uint128 liquidity;
        int24 tickLower;
        int24 tickUpper;
        address creator;
        uint64 launchedAt;
    }

    mapping(address token => Launch) public launches;
    address[] public tokens;

    /**
     * `name`, `symbol` et `metadataURI` ne sont pas répétés ici : ils se lisent
     * sur le token, et les inclure saturait la pile du compilateur.
     */
    event Launched(
        address indexed token,
        address indexed creator,
        address pool,
        uint256 tokenId,
        uint256 supply,
        uint128 liquidity,
        int24 tickLower,
        int24 tickUpper,
        Rules rules
    );

    error NotAContract(address who);
    error ZeroAddress();
    error SupplyOutOfRange();
    error PoolAlreadyExists();
    error UnexpectedTickSpacing(int24 spacing);
    error TickNotOnSpacing(int24 tick);
    error FactoryMismatch(address expected, address actual);
    error QuoteWasSpent(uint256 amount);
    error SupplyNotDeposited(uint256 expected, uint256 actual);
    error LiquidityMismatch(uint128 expected, uint128 actual);
    error WrongInitialTick(int24 expected, int24 actual);
    error Reentrancy();

    uint256 private _entered;

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(
        address ammFactory_,
        address positionManager_,
        address quote_,
        uint16 observationCardinality_,
        uint256 supply_,
        address treasury_,
        Rules memory rules_
    ) {
        // Une adresse sans code est la panne silencieuse par excellence : tous
        // les appels réussiraient en ne faisant rien.
        _mustBeContract(ammFactory_);
        _mustBeContract(positionManager_);
        _mustBeContract(quote_);
        // La trésorerie fait exception, et c'est délibéré : c'est un wallet.
        // Exiger du code y interdirait le cas normal.
        if (treasury_ == address(0)) revert ZeroAddress();

        ammFactory = IUniswapV3Factory(ammFactory_);
        positionManager = INonfungiblePositionManager(positionManager_);
        quote = quote_;

        // Le PositionManager doit servir la factory que nous interrogeons,
        // sinon les pools créés et les positions frappées vivent ailleurs.
        address pmFactory = INonfungiblePositionManager(positionManager_).factory();
        if (pmFactory != ammFactory_) revert FactoryMismatch(ammFactory_, pmFactory);

        // Le palier doit exister, et avoir l'espacement que les ticks supposent.
        int24 spacing = IUniswapV3Factory(ammFactory_).feeAmountTickSpacing(FEE);
        if (spacing != TICK_SPACING) revert UnexpectedTickSpacing(spacing);
        _mustBeOnSpacing(TICK_TOKEN0_LOWER);
        _mustBeOnSpacing(TICK_TOKEN0_UPPER);
        _mustBeOnSpacing(TICK_TOKEN1_LOWER);
        _mustBeOnSpacing(TICK_TOKEN1_UPPER);

        observationCardinality = observationCardinality_;
        if (supply_ < 1e18 || supply_ > 1e36) revert SupplyOutOfRange();
        supply = supply_;
        RevealRules.validate(rules_);
        rules = rules_;

        locker = new RevealLocker(positionManager_, treasury_);
    }

    function _mustBeContract(address who) private view {
        if (who == address(0)) revert ZeroAddress();
        if (who.code.length == 0) revert NotAContract(who);
    }

    function _mustBeOnSpacing(int24 tick) private pure {
        if (tick % TICK_SPACING != 0) revert TickNotOnSpacing(tick);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /**
     * Liquidité que la supply représente sur la plage, dérivée et non transcrite.
     *
     * Publique parce que c'est le nombre à confronter à la chaîne : pour une
     * supply d'un milliard, elle doit valoir exactement celle des positions du
     * launchpad de référence, dans les deux ordres de tokens.
     */
    function expectedLiquidity(bool tokenIsToken0) public view returns (uint128) {
        (int24 lower, int24 upper) = ticksFor(tokenIsToken0);
        uint160 sqrtLower = TickMath.getSqrtRatioAtTick(lower);
        uint160 sqrtUpper = TickMath.getSqrtRatioAtTick(upper);

        return tokenIsToken0
            ? LiquidityAmounts.liquidityForAmount0(sqrtLower, sqrtUpper, supply)
            : LiquidityAmounts.liquidityForAmount1(sqrtLower, sqrtUpper, supply);
    }

    function ticksFor(bool tokenIsToken0) public pure returns (int24 lower, int24 upper) {
        return tokenIsToken0
            ? (TICK_TOKEN0_LOWER, TICK_TOKEN0_UPPER)
            : (TICK_TOKEN1_LOWER, TICK_TOKEN1_UPPER);
    }

    /// Le tick auquel le pool s'ouvre : le bord où la position est à 100 % en
    /// tokens et à 0 % en quote.
    function initialTick(bool tokenIsToken0) public pure returns (int24) {
        return tokenIsToken0 ? TICK_TOKEN0_LOWER : TICK_TOKEN1_UPPER;
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
        string calldata metadataURI
    ) external nonReentrant returns (address token, address pool) {
        RevealToken deployed = new RevealToken(name, symbol, metadataURI, supply, rules);
        token = address(deployed);

        if (ammFactory.getPool(token, quote, FEE) != address(0)) revert PoolAlreadyExists();

        bool tokenIsToken0 = token < quote;
        pool = _seed(token, tokenIsToken0);

        // Sans cet appel la cardinalité vaut 1 : aucun historique, donc aucun
        // TWAP, donc aucun drawdown relief tant que le pool n'a pas grandi.
        IUniswapV3Pool(pool).increaseObservationCardinalityNext(observationCardinality);

        deployed.initialize(pool, quote, locker.treasury());
        tokens.push(token);

        Launch memory l = launches[token];
        emit Launched(
            token,
            msg.sender,
            pool,
            l.tokenId,
            supply,
            l.liquidity,
            l.tickLower,
            l.tickUpper,
            rules
        );
    }

    /**
     * Ouvre le pool au bord de la plage, y verse toute la supply, et fait
     * frapper le NFT directement au locker.
     *
     * « Directement » est la garantie qui compte : la position n'appartient à
     * aucun instant au créateur, au déployeur, à la trésorerie ni à ce
     * contrat. Il n'existe pas d'étape intermédiaire à intercepter.
     */
    function _seed(address token, bool tokenIsToken0) private returns (address pool) {
        (int24 lower, int24 upper) = ticksFor(tokenIsToken0);

        pool = _openPool(token, tokenIsToken0);
        (uint256 tokenId, uint128 liquidity) =
            _mintToLocker(token, tokenIsToken0, lower, upper);

        launches[token] = Launch({
            pool: pool,
            tokenId: tokenId,
            liquidity: liquidity,
            tickLower: lower,
            tickUpper: upper,
            creator: msg.sender,
            launchedAt: uint64(block.timestamp)
        });

        locker.register(
            token, pool, tokenId, lower, upper, liquidity, msg.sender, !tokenIsToken0
        );
    }

    function _openPool(address token, bool tokenIsToken0) private returns (address pool) {
        int24 startTick = initialTick(tokenIsToken0);
        (address token0, address token1) = tokenIsToken0 ? (token, quote) : (quote, token);

        pool = positionManager.createAndInitializePoolIfNecessary(
            token0, token1, FEE, TickMath.getSqrtRatioAtTick(startTick)
        );

        // Le pool vient d'être créé par nous : s'il n'ouvre pas au tick attendu,
        // quelque chose l'a devancé et le prix de départ n'est pas le nôtre.
        (, int24 openedAt,,,,,) = IUniswapV3Pool(pool).slot0();
        if (openedAt != startTick) revert WrongInitialTick(startTick, openedAt);
    }

    function _mintToLocker(address token, bool tokenIsToken0, int24 lower, int24 upper)
        private
        returns (uint256 tokenId, uint128 liquidity)
    {
        (address token0, address token1) = tokenIsToken0 ? (token, quote) : (quote, token);

        RevealToken(token).approve(address(positionManager), supply);

        uint256 used0;
        uint256 used1;
        (tokenId, liquidity, used0, used1) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: FEE,
                tickLower: lower,
                tickUpper: upper,
                amount0Desired: tokenIsToken0 ? supply : 0,
                amount1Desired: tokenIsToken0 ? 0 : supply,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(locker),
                deadline: block.timestamp
            })
        );

        // Toute approbation résiduelle est une surface d'attaque gratuite.
        RevealToken(token).approve(address(positionManager), 0);

        _assertSeeded(tokenIsToken0, liquidity, used0, used1);
    }

    /// Ce que le lancement doit avoir produit, vérifié plutôt que supposé.
    function _assertSeeded(
        bool tokenIsToken0,
        uint128 liquidity,
        uint256 used0,
        uint256 used1
    ) private view {
        (uint256 usedToken, uint256 usedQuote) =
            tokenIsToken0 ? (used0, used1) : (used1, used0);

        // Aucune quote ne doit être dépensée : sinon la position n'est pas
        // unilatérale et le launcher devrait un actif qu'il ne détient pas.
        if (usedQuote != 0) revert QuoteWasSpent(usedQuote);

        // La supply doit être passée presque entièrement — le reste est la
        // poussière d'arrondi entier, de l'ordre de quelques milliers de wei.
        if (usedToken > supply || supply - usedToken > supply / 1e9) {
            revert SupplyNotDeposited(supply, usedToken);
        }

        uint128 expected = expectedLiquidity(tokenIsToken0);
        if (liquidity != expected) revert LiquidityMismatch(expected, liquidity);
    }
}
