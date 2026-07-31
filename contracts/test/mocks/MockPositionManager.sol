// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {INonfungiblePositionManager} from
    "../../src/interfaces/INonfungiblePositionManager.sol";
import {
    IUniswapV3Factory, IUniswapV3MintCallback, IUniswapV3Pool
} from "../../src/interfaces/IUniswapV3.sol";
import {LiquidityAmounts} from "../../src/libraries/LiquidityAmounts.sol";
import {TickMath} from "../../src/libraries/TickMath.sol";

/**
 * Doublure du NonfungiblePositionManager d'Uniswap, pour les tests locaux.
 *
 * Pourquoi une doublure plutôt que le vrai contrat : v3-periphery est figé en
 * 0.7.6 et réclame OpenZeppelin 3.4, incompatible avec la 5.x dont dépend `src`
 * — et surtout, `PoolAddress` y embarque en dur le hash d'init code du pool
 * *tel qu'Uniswap l'a compilé*. Recompilé localement avec d'autres réglages, le
 * pool a un autre bytecode, donc un autre hash, donc le manager cherche les
 * pools à des adresses qui n'existent pas. Une copie locale du vrai contrat
 * donnerait donc une fausse assurance, pas une vraie.
 *
 * Cette doublure ne calcule aucune adresse : elle demande le pool à la factory.
 * Elle reprend en revanche exactement la formule de liquidité de
 * `LiquidityAmounts.getLiquidityForAmounts`, qui est ce que les assertions du
 * launcher vérifient.
 *
 * Ce qu'elle ne prouve pas — que le vrai manager se comporte pareil sur la
 * vraie chaîne — est couvert par `RevealForkRobinhood`, qui lance contre le
 * NonfungiblePositionManager réellement déployé sur Robinhood Chain.
 */
contract MockPositionManager is ERC721, INonfungiblePositionManager, IUniswapV3MintCallback {
    address public immutable override factory;
    address public immutable override WETH9;

    struct Stored {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address pool;
    }

    mapping(uint256 => Stored) private _stored;
    uint256 private _nextId = 1;
    /// Renseigné le temps d'un `mint`, pour authentifier le rappel et savoir qui paie.
    address private _payer;
    address private _minting;

    error DeadlinePassed();
    error UnexpectedCallback();
    error NotAuthorized();
    error NoPool();

    constructor(address factory_, address weth_) ERC721("Mock V3 Positions", "MOCK-V3-POS") {
        factory = factory_;
        WETH9 = weth_;
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable override returns (address pool) {
        pool = IUniswapV3Factory(factory).getPool(token0, token1, fee);
        if (pool == address(0)) pool = IUniswapV3Factory(factory).createPool(token0, token1, fee);

        (uint160 existing,,,,,,) = IUniswapV3Pool(pool).slot0();
        if (existing == 0) IUniswapV3Pool(pool).initialize(sqrtPriceX96);
    }

    function mint(MintParams calldata params)
        external
        payable
        override
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        if (block.timestamp > params.deadline) revert DeadlinePassed();

        address pool = IUniswapV3Factory(factory).getPool(
            params.token0, params.token1, params.fee
        );
        if (pool == address(0)) revert NoPool();

        (uint160 sqrtCurrent,,,,,,) = IUniswapV3Pool(pool).slot0();
        liquidity = _liquidityForAmounts(
            sqrtCurrent,
            TickMath.getSqrtRatioAtTick(params.tickLower),
            TickMath.getSqrtRatioAtTick(params.tickUpper),
            params.amount0Desired,
            params.amount1Desired
        );

        _payer = msg.sender;
        _minting = pool;
        (amount0, amount1) = IUniswapV3Pool(pool).mint(
            address(this),
            params.tickLower,
            params.tickUpper,
            liquidity,
            abi.encode(params.token0, params.token1)
        );
        _minting = address(0);
        _payer = address(0);

        require(amount0 >= params.amount0Min && amount1 >= params.amount1Min, "slippage");

        tokenId = _nextId++;
        _stored[tokenId] = Stored({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            pool: pool
        });
        // `_mint` et non `_safeMint` : c'est ce que fait le vrai manager, donc
        // le destinataire n'a pas besoin d'implémenter `onERC721Received`.
        _mint(params.recipient, tokenId);
    }

    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        if (msg.sender != _minting || _minting == address(0)) revert UnexpectedCallback();

        (address token0, address token1) = abi.decode(data, (address, address));
        if (amount0Owed > 0) IERC20(token0).transferFrom(_payer, msg.sender, amount0Owed);
        if (amount1Owed > 0) IERC20(token1).transferFrom(_payer, msg.sender, amount1Owed);
    }

    /**
     * Frais uniquement. `burn` à zéro matérialise ce qui est dû sans retirer
     * une unité de principal — c'est exactement ce que fait le vrai manager, et
     * la seule raison pour laquelle un locker peut collecter sans pouvoir voler.
     */
    function collect(CollectParams calldata params)
        external
        payable
        override
        returns (uint256 amount0, uint256 amount1)
    {
        if (_ownerOf(params.tokenId) != msg.sender) revert NotAuthorized();
        Stored memory s = _stored[params.tokenId];

        IUniswapV3Pool(s.pool).burn(s.tickLower, s.tickUpper, 0);
        (uint128 got0, uint128 got1) = IUniswapV3Pool(s.pool).collect(
            params.recipient,
            s.tickLower,
            s.tickUpper,
            params.amount0Max,
            params.amount1Max
        );
        return (got0, got1);
    }

    function positions(uint256 tokenId)
        external
        view
        override
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Stored memory s = _stored[tokenId];
        (uint128 live,,, uint128 owed0, uint128 owed1) = IUniswapV3Pool(s.pool).positions(
            keccak256(abi.encodePacked(address(this), s.tickLower, s.tickUpper))
        );
        return (
            0,
            address(0),
            s.token0,
            s.token1,
            s.fee,
            s.tickLower,
            s.tickUpper,
            live,
            0,
            0,
            owed0,
            owed1
        );
    }

    function ownerOf(uint256 tokenId)
        public
        view
        override(ERC721, INonfungiblePositionManager)
        returns (address)
    {
        return ERC721.ownerOf(tokenId);
    }

    /// La formule du vrai `LiquidityAmounts.getLiquidityForAmounts`.
    function _liquidityForAmounts(
        uint160 sqrtCurrent,
        uint160 sqrtLower,
        uint160 sqrtUpper,
        uint256 amount0,
        uint256 amount1
    ) private pure returns (uint128) {
        if (sqrtCurrent <= sqrtLower) {
            return LiquidityAmounts.liquidityForAmount0(sqrtLower, sqrtUpper, amount0);
        }
        if (sqrtCurrent < sqrtUpper) {
            uint128 l0 = LiquidityAmounts.liquidityForAmount0(sqrtCurrent, sqrtUpper, amount0);
            uint128 l1 = LiquidityAmounts.liquidityForAmount1(sqrtLower, sqrtCurrent, amount1);
            return l0 < l1 ? l0 : l1;
        }
        return LiquidityAmounts.liquidityForAmount1(sqrtLower, sqrtUpper, amount1);
    }
}
