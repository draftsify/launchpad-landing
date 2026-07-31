// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INonfungiblePositionManager} from "./interfaces/INonfungiblePositionManager.sol";
import {IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";
import {LiquidityAmounts} from "./libraries/LiquidityAmounts.sol";
import {TickMath} from "./libraries/TickMath.sol";

/**
 * Propriétaire définitif des positions de liquidité, et jalon de graduation.
 *
 * « Verrouillé » veut dire ici, et rien de moins :
 *   - le locker possède le NFT de position, pour toujours ;
 *   - aucun chemin de code ne peut l'approuver, le transférer ou le brûler ;
 *   - aucun chemin de code ne peut appeler `decreaseLiquidity` ;
 *   - les frais se collectent, sans jamais toucher au principal ;
 *   - le destinataire des frais ne peut ni être changé ni détourner la position.
 *
 * La garantie ne repose pas sur des vérifications d'accès mais sur l'absence :
 * `INonfungiblePositionManager` ne déclare ni `decreaseLiquidity`, ni `burn`,
 * ni `approve`, ni `setApprovalForAll`, ni `transferFrom`. Ce contrat ne peut
 * donc pas les appeler, même par erreur. Il n'a pas non plus de `fallback`, pas
 * d'appel arbitraire, pas de `delegatecall`, pas de fonction de sauvetage, pas
 * de propriétaire et pas de chemin de mise à jour.
 *
 * `collect` verse toujours à `treasury`, fixée au déploiement et immuable. Elle
 * est ouverte à tous : personne n'a besoin d'une clé pour l'actionner, personne
 * ne peut en détourner la destination, et le contrat ne détient jamais les
 * fonds — le PositionManager les envoie directement.
 *
 * La graduation est un statut, pas une migration. Rien ici ne déplace de
 * liquidité, ne change de pool, de palier de frais ou de ticks. Voir
 * `graduationProgress` pour ce qui est réellement mesuré.
 */
contract RevealLocker {
    /// Seuil de graduation, en quote. Le même que celui du launchpad dominant
    /// de cette chaîne, pour que la comparaison soit lisible par tous.
    uint256 public constant GRADUATION_QUOTE = 4.2 ether;

    INonfungiblePositionManager public immutable positionManager;
    /// Destinataire des frais, fixé au déploiement et non modifiable.
    address public immutable treasury;
    /// Seul autorisé à enregistrer une position : le launcher qui l'a créée.
    address public immutable launcher;

    struct Position {
        address pool;
        uint256 tokenId;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address creator;
        /// L'ordre des tokens dépend des adresses : il décide de quel côté de
        /// la position se lit la quote.
        bool quoteIsToken0;
    }

    mapping(address token => Position) public positions;
    /// Jalon atteint et enregistré. Une fois vrai, jamais faux : un jalon ne se
    /// dé-franchit pas parce que le prix est redescendu.
    mapping(address token => bool) public graduated;

    event Registered(
        address indexed token,
        address indexed pool,
        uint256 tokenId,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    );
    /**
     * Marqueur de comportement, lisible avant toute collecte.
     *
     * Le locker précédent envoyait les deux côtés à la trésorerie et n'expose
     * pas cette constante : un appel y échoue. Une interface peut donc savoir à
     * quel contrat elle parle sans le deviner à l'adresse, et décrire le partage
     * seulement là où il existe. Annoncer une part créateur sur un contrat qui
     * n'en verse pas serait la pire des deux erreurs possibles.
     */
    bool public constant SPLITS_FEES = true;

    /**
     * Une collecte, et où chaque côté est allé. Les noms disent le destinataire
     * plutôt que l'ordre des jetons dans la paire : `amount0`/`amount1`
     * obligeaient tout lecteur à retrouver lequel des deux était la quote.
     */
    event Collected(
        address indexed token, uint256 quoteToTreasury, uint256 tokensToCreator
    );
    event Graduated(address indexed token, address indexed pool, uint256 quoteAmount);

    error OnlyLauncher();
    error OnlyPositionManager();
    error AlreadyRegistered();
    error UnknownToken();
    error NoTreasury();
    error NoPositionManager();
    error AlreadyGraduated();
    error NotGraduatedYet(uint256 progress);
    error Reentrancy();

    uint256 private _entered;

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(address positionManager_, address treasury_) {
        if (treasury_ == address(0)) revert NoTreasury();
        if (positionManager_.code.length == 0) revert NoPositionManager();

        positionManager = INonfungiblePositionManager(positionManager_);
        treasury = treasury_;
        launcher = msg.sender;
    }

    /**
     * Accepte les NFT du PositionManager canonique, et rien d'autre.
     *
     * Le NFT est frappé directement à cette adresse — il n'appartient à aucun
     * moment au créateur, au déployeur, à la trésorerie ni à un EOA. Cette
     * fonction existe pour que le contrat soit un destinataire ERC-721 correct,
     * y compris si un transfert sécurisé lui en envoie un.
     */
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != address(positionManager)) revert OnlyPositionManager();
        return this.onERC721Received.selector;
    }

    function register(
        address token,
        address pool,
        uint256 tokenId,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        address creator,
        bool quoteIsToken0
    ) external {
        if (msg.sender != launcher) revert OnlyLauncher();
        if (positions[token].pool != address(0)) revert AlreadyRegistered();

        positions[token] = Position({
            pool: pool,
            tokenId: tokenId,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            creator: creator,
            quoteIsToken0: quoteIsToken0
        });
        emit Registered(token, pool, tokenId, tickLower, tickUpper, liquidity);
    }

    // ----------------------------------------------------------------- frais

    /**
     * Verse les frais accumulés. Appelable par n'importe qui.
     *
     * **Chaque côté va à un destinataire différent** : la quote à la trésorerie,
     * les tokens au créateur du lancement. Uniswap prélève sa commission sur le
     * jeton *entrant* de chaque échange — un achat paie en quote, une vente paie
     * en token — donc ce partage suit la nature de ce qui a été gagné plutôt
     * qu'un pourcentage décidé à l'avance.
     *
     * Deux appels et non un, parce que `CollectParams` ne porte qu'un
     * destinataire mais deux plafonds : en mettre un à zéro ne collecte que
     * l'autre côté. La conséquence est ce qui rend ce partage possible — les
     * tokens vont **du pool au créateur directement**. Ce contrat ne les détient
     * à aucun instant, donc il n'a jamais à sortir d'une position, donc il n'a
     * besoin d'aucune dispense du verrou que le protocole impose à tous.
     *
     * Corollaire voulu : les tokens ainsi reçus ouvrent chez le créateur une
     * position ordinaire. Il est verrouillé comme n'importe quel acheteur, et
     * une collecte rajeunit sa part encore bloquée, exactement comme un rachat.
     *
     * Autre corollaire, et c'est le plus utile : la trésorerie est payée par
     * *n'importe quelle* collecte, y compris celle qu'un créateur déclenche pour
     * lui-même. Elle n'a rien à réclamer.
     *
     * `collect` du PositionManager matérialise les frais dus par un `burn` à
     * zéro puis les transfère : la liquidité de la position est arithmétiquement
     * intacte. Aucune diminution n'est demandée ici parce qu'aucune fonction de
     * ce contrat ne sait en demander une.
     */
    function collect(address token)
        external
        nonReentrant
        returns (uint256 quoteToTreasury, uint256 tokensToCreator)
    {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();

        uint128 all = type(uint128).max;

        (uint256 q0, uint256 q1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: p.tokenId,
                recipient: treasury,
                amount0Max: p.quoteIsToken0 ? all : 0,
                amount1Max: p.quoteIsToken0 ? 0 : all
            })
        );
        quoteToTreasury = p.quoteIsToken0 ? q0 : q1;

        (uint256 t0, uint256 t1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: p.tokenId,
                recipient: p.creator,
                amount0Max: p.quoteIsToken0 ? 0 : all,
                amount1Max: p.quoteIsToken0 ? all : 0
            })
        );
        tokensToCreator = p.quoteIsToken0 ? t1 : t0;

        emit Collected(token, quoteToTreasury, tokensToCreator);
    }

    /**
     * Frais déjà matérialisés sur la position.
     *
     * Honnêteté sur ce que ce nombre est : le PositionManager ne met
     * `tokensOwed` à jour qu'au moment d'un `collect`, donc ce qui est lu ici
     * retarde sur ce qui est réellement dû. Pour le montant exact à l'instant t,
     * simuler `collect` en `eth_call` — c'est ce que fait l'interface.
     */
    function owedRecorded(address token)
        external
        view
        returns (uint128 amount0, uint128 amount1)
    {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();
        (,,,,,,,,,, amount0, amount1) = positionManager.positions(p.tokenId);
    }

    /// Liquidité que le PositionManager attribue réellement à la position.
    /// Doit valoir exactement celle enregistrée, pour toujours.
    function liquidityNow(address token) public view returns (uint128 liquidity) {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();
        (,,,,,,, liquidity,,,,) = positionManager.positions(p.tokenId);
    }

    /// Propriétaire du NFT. Doit valoir cette adresse, pour toujours.
    function positionOwner(address token) external view returns (address) {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();
        return positionManager.ownerOf(p.tokenId);
    }

    // ------------------------------------------------------------ graduation

    /**
     * Quote réellement détenue par la position verrouillée, au prix courant.
     *
     * Ce n'est délibérément pas `WETH.balanceOf(pool)`. Ce solde-là inclut tout
     * virement direct au pool et toute position ouverte par un tiers dans le
     * même pool : n'importe qui pourrait déclencher la graduation en envoyant
     * de l'ETH. Ici, seuls comptent la liquidité de *notre* position et *nos*
     * ticks, évalués au prix du pool. Un don ne bouge pas le prix, donc ne bouge
     * pas ce nombre.
     */
    function graduationProgress(address token) public view returns (uint256) {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();

        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(p.pool).slot0();
        if (sqrtPriceX96 == 0) return 0;

        return LiquidityAmounts.quoteInPosition(
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(p.tickLower),
            TickMath.getSqrtRatioAtTick(p.tickUpper),
            p.liquidity,
            p.quoteIsToken0
        );
    }

    /**
     * Enregistre le franchissement du seuil. Ouvert à tous, sans effet autre que
     * le drapeau et l'événement : même token, même pool, mêmes ticks, même
     * position, même liquidité, mêmes permissions. Il n'y a rien à migrer.
     *
     * La graduation n'est pas un gage de qualité et ne garantit aucune sortie.
     */
    function syncGraduation(address token) external {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownToken();
        if (graduated[token]) revert AlreadyGraduated();

        uint256 progress = graduationProgress(token);
        if (progress < GRADUATION_QUOTE) revert NotGraduatedYet(progress);

        graduated[token] = true;
        emit Graduated(token, p.pool, progress);
    }
}
