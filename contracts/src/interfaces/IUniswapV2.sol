// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Interfaces minimales : v2-core est figé en 0.5.16 et ne peut pas être
/// importé ici. Seules les fonctions dont le protocole dépend sont déclarées.

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IUniswapV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
    function mint(address to) external returns (uint256 liquidity);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data)
        external;
    function sync() external;
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}
