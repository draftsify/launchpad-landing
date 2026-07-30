// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * Conversions liquidité ↔ montants de Uniswap V3, portées en 0.8.
 *
 * Deux usages, et ils tirent dans des sens opposés :
 *   - au lancement, `liquidityForAmount*` dit quelle liquidité représente la
 *     supply entière posée d'un seul côté ;
 *   - pour la graduation, `quoteInPosition` dit combien de quote la position
 *     contient au prix courant — le principal, et lui seul.
 *
 * Le second point est ce qui rend la graduation non falsifiable. Lire
 * `WETH.balanceOf(pool)` serait plus simple, mais n'importe qui pourrait alors
 * déclencher la graduation par un simple virement au pool, ou en ouvrant une
 * position sans rapport dans le même pool. Ici on ne lit que ce que *notre*
 * position, à *nos* ticks, contient réellement.
 *
 * `Math.mulDiv` d'OpenZeppelin fait la multiplication en 512 bits : les
 * produits `montant × sqrtPrice` débordent un uint256 bien avant d'être divisés.
 */
library LiquidityAmounts {
    uint256 internal constant Q96 = 1 << 96;

    /// Liquidité d'une position entièrement en token0 (prix au bord bas).
    function liquidityForAmount0(uint160 sqrtLower, uint160 sqrtUpper, uint256 amount0)
        internal
        pure
        returns (uint128)
    {
        uint256 intermediate = Math.mulDiv(sqrtLower, sqrtUpper, Q96);
        return uint128(Math.mulDiv(amount0, intermediate, sqrtUpper - sqrtLower));
    }

    /// Liquidité d'une position entièrement en token1 (prix au bord haut).
    function liquidityForAmount1(uint160 sqrtLower, uint160 sqrtUpper, uint256 amount1)
        internal
        pure
        returns (uint128)
    {
        return uint128(Math.mulDiv(amount1, Q96, sqrtUpper - sqrtLower));
    }

    /// Token0 contenu entre deux prix, pour une liquidité donnée.
    function amount0ForLiquidity(uint160 sqrtLower, uint160 sqrtUpper, uint128 liquidity)
        internal
        pure
        returns (uint256)
    {
        if (sqrtLower >= sqrtUpper) return 0;
        return Math.mulDiv(
            uint256(liquidity) << 96, sqrtUpper - sqrtLower, uint256(sqrtUpper)
        ) / sqrtLower;
    }

    /// Token1 contenu entre deux prix, pour une liquidité donnée.
    function amount1ForLiquidity(uint160 sqrtLower, uint160 sqrtUpper, uint128 liquidity)
        internal
        pure
        returns (uint256)
    {
        if (sqrtLower >= sqrtUpper) return 0;
        return Math.mulDiv(liquidity, sqrtUpper - sqrtLower, Q96);
    }

    /**
     * Quote effectivement détenue par la position au prix courant.
     *
     * Le prix est ramené dans la plage avant tout calcul : au-dessous du bord
     * bas la position est intégralement en token0, au-dessus du bord haut
     * intégralement en token1.
     */
    function quoteInPosition(
        uint160 sqrtPrice,
        uint160 sqrtLower,
        uint160 sqrtUpper,
        uint128 liquidity,
        bool quoteIsToken0
    ) internal pure returns (uint256) {
        if (liquidity == 0) return 0;

        uint160 clamped = sqrtPrice < sqrtLower
            ? sqrtLower
            : (sqrtPrice > sqrtUpper ? sqrtUpper : sqrtPrice);

        return quoteIsToken0
            ? amount0ForLiquidity(clamped, sqrtUpper, liquidity)
            : amount1ForLiquidity(sqrtLower, clamped, liquidity);
    }
}
