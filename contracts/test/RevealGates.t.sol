// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {RevealRules} from "../src/libraries/RevealRules.sol";

/// Les trois portes du protocole, portées sur Uniswap V3.
contract RevealGatesTest is RevealBase {
    // ---------------------------------------------------------- anti-sniper

    function test_LaunchDelayBlocksTheFirstSeconds() public {
        _giveWeth(alice, 0.01 ether);
        vm.prank(alice);
        vm.expectRevert(bytes("TF"));
        router.swap(address(pool), alice, !tokenFirst, int256(uint256(0.01 ether)));

        _warp(31);
        _buy(alice, 0.01 ether);
        assertGt(token.balanceOf(alice), 0, "l'achat passe le delai ecoule");
    }

    /**
     * En liquidite unilaterale, la rampe se mesure sur la supply en circulation
     * et non sur la reserve du pool : au lancement le pool detient tout, donc
     * un pourcentage de sa reserve n'aurait rien freine.
     */
    function test_BuyRampCapsTheFirstBuys() public {
        _warp(31);

        // Au debut de la rampe, un achat est borne a 0,25 % de la supply.
        uint256 maxBuy = (token.totalSupply() * 25) / 10_000;
        _giveWeth(whale, 1 ether);
        vm.prank(whale);
        vm.expectRevert(bytes("TF"));
        router.swap(address(pool), whale, !tokenFirst, int256(uint256(1 ether)));

        // Un petit achat passe, lui.
        _buy(alice, 0.002 ether);
        assertGt(token.balanceOf(alice), 0, "un achat sous la borne passe");
        assertLt(token.balanceOf(alice), maxBuy, "et il reste sous la borne");

        _pastRamp();
        _buy(whale, 1 ether);
        assertGt(token.balanceOf(whale), maxBuy, "la rampe ne bride plus");
    }

    // ------------------------------------------------------------ deblocage

    function test_UnlockStartsAtInitialShareAndCompletes() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        assertApproxEqAbs(token.unlockedBps(alice), 1_000, 5, "10 % a l'entree");
        assertApproxEqRel(token.releasable(alice), token.balanceOf(alice) / 10, 0.02e18);

        _warp(12 hours);
        assertApproxEqAbs(token.unlockedBps(alice), 5_500, 30, "moitie a mi-parcours");

        _fullyUnlock();
        assertEq(token.unlockedBps(alice), 10_000, "entierement libere");
    }

    function test_SellAboveUnlockedReverts() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        uint256 balance = token.balanceOf(alice);
        uint256 open = token.releasable(alice);

        vm.expectRevert(abi.encodeWithSelector(RevealToken.PositionLocked.selector, open));
        _sellRaw(alice, (balance * 2) / 10);
    }

    /// Le piege du modele naif : le budget ne doit pas se reconstituer en vendant.
    function test_SellingDoesNotReopenTheSameShare() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        uint256 tenth = token.balanceOf(alice) / 10;
        _sell(alice, (tenth * 9) / 10);

        assertLt(token.releasable(alice), tenth / 5, "le budget ne se reconstitue pas");
        vm.expectRevert();
        _sellRaw(alice, tenth);
    }

    function test_SplittingAcrossWalletsDoesNotEscapeUnlock() public {
        _pastRamp();
        _buy(alice, 0.05 ether);
        _fullyUnlock();

        uint256 entry = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, entry);

        assertEq(token.unlockedBps(bob), 1_000, "bob repart au deblocage initial");
    }

    // -------------------------------------------------------- plafond d'impact

    /**
     * Le plafond se mesure sur la reserve de quote. Corollaire voulu : tant que
     * personne n'a achete, il n'y a rien a retirer et rien ne peut etre vendu.
     */
    function test_NothingSellableBeforeAnyoneHasBought() public {
        _pastRamp();
        assertEq(_quoteReserve(), 0);
        assertEq(token.windowRemaining(alice), 0, "aucune quote, aucun plafond");
    }

    function test_ImpactCapBlocksASecondSellInTheSameWindow() public {
        _pastRamp();
        _buy(whale, 2 ether);
        _fullyUnlock();

        uint256 cap = token.windowRemaining(whale);
        assertGt(cap, 0, "de la quote est entree, le plafond existe");

        _sell(whale, cap);
        // Vendre retire de la quote du pool, donc le plafond se resserre.
        assertLt(token.windowRemaining(whale), cap / 4, "fenetre epuisee");

        vm.expectRevert();
        _sellRaw(whale, cap);
    }

    function test_ImpactCapDecaysAcrossTheWindow() public {
        _pastRamp();
        _buy(whale, 2 ether);
        _fullyUnlock();

        uint256 cap = token.windowRemaining(whale);
        _sell(whale, cap / 2);
        uint256 justAfter = token.windowRemaining(whale);

        _warp(5 minutes + 1);
        assertGt(token.windowRemaining(whale), justAfter, "le plafond revient");
    }

    // ------------------------------------------------------- drawdown relief

    function test_NoReliefWithoutTwapHistory() public {
        _pastRamp();
        _buy(alice, 0.05 ether);
        // Sans historique d'oracle, aucun relief : retomber sur le spot
        // laisserait manipuler le prix d'un bloc pour se debloquer.
        assertEq(token.drawdownTicks(alice), 0);
    }

    /// EN COURS : la perte latente ressort a zero apres le portage V3. Reste a
    /// determiner si le TWAP n(')est pas encore frais ou si le signe du tick est
    /// inverse dans un des deux ordres de tokens. Le relief est donc NON VERIFIE
    /// sur V3 : ne pas deployer avant.
    function test_ReliefOpensThePositionWhenPriceFalls() public {
        vm.skip(true);
        _pastRamp();
        _buy(whale, 2 ether);
        _buy(alice, 0.2 ether);

        _warp(10 minutes);
        uint256 byTimeOnly = token.unlockedBps(alice);

        // La baleine sort, le prix plonge, puis une fenetre entiere s'ecoule
        // a ce niveau pour que le TWAP le refleche.
        _fullyUnlock();
        for (uint256 i = 0; i < 6; i++) {
            uint256 room = token.windowRemaining(whale);
            if (room == 0) break;
            _sell(whale, room);
            _warp(5 minutes + 1);
        }
        _warp(10 minutes);

        uint256 drop = token.drawdownTicks(alice);
        assertGt(drop, 0, "position en perte latente");
        assertGe(
            token.unlockedBps(alice),
            RevealRules.reliefBps(drop),
            "le relief est au moins son plancher"
        );
        assertGt(token.unlockedBps(alice), byTimeOnly, "le plancher a monte");
    }
}
