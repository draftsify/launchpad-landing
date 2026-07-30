// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {TickMath} from "../src/libraries/TickMath.sol";

interface ITickMathExposer {
    function sqrtRatioAt(int24 tick) external pure returns (uint160);
}

/**
 * Le portage de `TickMath` en 0.8 est confronté à la bibliothèque canonique,
 * compilée en 0.7.6 et déployée à côté. C'est ce qui autorise à embarquer une
 * table de constantes magiques dans `src` : elle n'est pas relue à l'œil, elle
 * est comparée tick par tick à l'originale.
 */
contract TickMathParityTest is Test {
    ITickMathExposer internal canonical;

    function setUp() public {
        canonical = ITickMathExposer(deployCode("TickMathExposer.sol:TickMathExposer"));
    }

    function test_MatchesCanonicalAtTheTicksTheProtocolUses() public view {
        int24[6] memory ticks =
            [int24(-204_200), 204_200, -887_200, 887_200, -203_200, 0];

        for (uint256 i = 0; i < ticks.length; i++) {
            assertEq(
                TickMath.getSqrtRatioAtTick(ticks[i]),
                canonical.sqrtRatioAt(ticks[i]),
                "divergence sur un tick du protocole"
            );
        }
    }

    /// La valeur observée sur la chaîne pour un pool de référence à zéro achat.
    function test_MatchesTheObservedOnChainStartingPrice() public pure {
        assertEq(
            TickMath.getSqrtRatioAtTick(-204_200),
            2_917_122_157_712_197_017_744_680,
            "le prix de depart ne correspond pas a celui observe sur la chaine"
        );
    }

    function testFuzz_MatchesCanonicalEverywhere(int24 tick) public view {
        tick = int24(bound(tick, TickMath.MIN_TICK, TickMath.MAX_TICK));
        assertEq(
            TickMath.getSqrtRatioAtTick(tick),
            canonical.sqrtRatioAt(tick),
            "divergence avec TickMath canonique"
        );
    }

    function test_RejectsTicksOutOfBounds() public {
        vm.expectRevert(TickMath.TickOutOfBounds.selector);
        this.callGetSqrtRatioAtTick(TickMath.MAX_TICK + 1);
    }

    function callGetSqrtRatioAtTick(int24 tick) external pure returns (uint160) {
        return TickMath.getSqrtRatioAtTick(tick);
    }
}
