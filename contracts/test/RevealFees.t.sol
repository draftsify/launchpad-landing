// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealFees} from "../src/RevealFees.sol";

/// Les frais du pool doivent sortir, la liquidite jamais.
contract RevealFeesTest is RevealBase {
    function test_PositionIsOwnedByTheCollectorNotABurnAddress() public view {
        (address p,,) = launcher.fees().positions(address(token));
        assertEq(p, address(pool), "position enregistree");
        assertEq(launcher.fees().treasury(), treasury);
        assertEq(token.feeTreasury(), treasury, "le token connait la tresorerie");
    }

    function test_SwapFeesReachTheTreasury() public {
        _pastRamp();
        _buy(whale, 2 ether);
        _fullyUnlock();
        _sell(whale, token.windowRemaining(whale));

        uint128 liquidityBefore = pool.liquidity();
        uint256 wethBefore = weth.balanceOf(treasury);

        RevealFees fees = launcher.fees();
        (uint256 a0, uint256 a1) = fees.collect(address(token));

        assertGt(a0 + a1, 0, "des frais ont ete collectes");
        assertGt(weth.balanceOf(treasury), wethBefore, "la tresorerie a recu de la quote");
        assertEq(pool.liquidity(), liquidityBefore, "la liquidite n'a pas bouge");
    }

    /// N'importe qui peut declencher la collecte, et elle va toujours au meme
    /// endroit : aucune cle n'est necessaire pour l'actionner ni pour la voler.
    function test_CollectIsPermissionlessButNotRedirectable() public {
        _pastRamp();
        _buy(whale, 2 ether);

        uint256 before = weth.balanceOf(treasury);
        vm.prank(bob);
        launcher.fees().collect(address(token));

        assertGt(weth.balanceOf(treasury), before);
        assertEq(weth.balanceOf(bob), 0, "l'appelant ne touche rien");
    }

    /// Les tokens percus en frais restent soumis aux regles de vente : le
    /// protocole n'est pas exempte des siennes.
    function test_TreasuryTokensAreStillMetered() public {
        _pastRamp();
        _buy(whale, 2 ether);
        _fullyUnlock();
        _sell(whale, token.windowRemaining(whale));

        launcher.fees().collect(address(token));
        uint256 held = token.balanceOf(treasury);
        if (held == 0) return; // aucun frais cote token sur ce parcours

        assertGt(token.unlockedBps(treasury), 0);
        assertLt(token.releasable(treasury), held, "pas librement vendable");
    }
}
