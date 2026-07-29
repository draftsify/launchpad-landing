// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

import {TickMath} from "v3-core/libraries/TickMath.sol";

/**
 * Expose TickMath, qui ne compile pas sous 0.8 : ses conversions int24 → uint256
 * y sont illégales. Plutôt que de retranscrire une table de constantes magiques
 * dans notre propre code — précisément ce qu'on ne veut pas écrire à la main —
 * on déploie la version canonique et on l'interroge depuis les scripts et les
 * tests. Les valeurs obtenues deviennent des paramètres de constructeur.
 */
contract TickMathExposer {
    function sqrtRatioAt(int24 tick) external pure returns (uint160) {
        return TickMath.getSqrtRatioAtTick(tick);
    }

    function tickAt(uint160 sqrtPriceX96) external pure returns (int24) {
        return TickMath.getTickAtSqrtRatio(sqrtPriceX96);
    }
}
