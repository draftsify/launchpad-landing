// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Interfaces minimales : v3-core est figé en 0.7.6 et ne peut pas être importé
/// ici. Seules les fonctions dont le protocole dépend sont déclarées.

interface IUniswapV3Factory {
    function createPool(address tokenA, address tokenB, uint24 fee)
        external
        returns (address pool);
    function getPool(address tokenA, address tokenB, uint24 fee)
        external
        view
        returns (address pool);
}

interface IUniswapV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function initialize(uint160 sqrtPriceX96) external;

    /// Verse la liquidité et rappelle `uniswapV3MintCallback` pour être payée.
    function mint(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external returns (uint256 amount0, uint256 amount1);

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    /// Oracle natif : cumuls de ticks, d'où se tire une moyenne temporelle.
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityX128);

    /// Sans cet appel la cardinalité vaut 1 : aucun historique, donc aucun TWAP.
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;

    function liquidity() external view returns (uint128);

    /// À zéro : matérialise les frais dus sans retirer de liquidité.
    function burn(int24 tickLower, int24 tickUpper, uint128 amount)
        external
        returns (uint256 amount0, uint256 amount1);

    function collect(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external returns (uint128 amount0, uint128 amount1);

    function positions(bytes32 key)
        external
        view
        returns (
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    /// Utilisé par les tests et par tout routeur : le pool rappelle
    /// `uniswapV3SwapCallback` pour se faire payer l'entrant.
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

interface IUniswapV3MintCallback {
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external;
}
