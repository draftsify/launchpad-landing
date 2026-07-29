// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IUniswapV3Pool} from "../../src/interfaces/IUniswapV3.sol";

/**
 * Routeur minimal pour les tests. Il paie par `transferFrom` depuis le compte
 * qui échange, jamais depuis le sien : c'est ce qui fait que le hook du token
 * voit bien la vente comme venant du vendeur, et non du routeur.
 */
contract TestSwapRouter {
    uint160 internal constant MIN_SQRT = 4_295_128_739;
    uint160 internal constant MAX_SQRT =
        1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;

    struct Payment {
        address payer;
        address tokenIn;
    }

    Payment private pending;

    function swap(address pool, address who, bool zeroForOne, int256 amountSpecified)
        external
        returns (int256 amount0, int256 amount1)
    {
        address tokenIn =
            zeroForOne ? IUniswapV3Pool(pool).token0() : IUniswapV3Pool(pool).token1();
        pending = Payment({payer: who, tokenIn: tokenIn});

        (amount0, amount1) = IUniswapV3Pool(pool).swap(
            who,
            zeroForOne,
            amountSpecified,
            zeroForOne ? MIN_SQRT + 1 : MAX_SQRT - 1,
            ""
        );

        delete pending;
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata)
        external
    {
        uint256 owed = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        IERC20(pending.tokenIn).transferFrom(pending.payer, msg.sender, owed);
    }
}
