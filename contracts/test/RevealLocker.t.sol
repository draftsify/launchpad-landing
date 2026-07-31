// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {RevealBase} from "./RevealBase.t.sol";
import {RevealLocker} from "../src/RevealLocker.sol";

/**
 * Les invariants du verrou, et la graduation.
 *
 * « Verrouillé » ne veut rien dire tant qu'on ne dit pas ce qui est impossible.
 * Ici : le NFT ne bouge pas, la liquidité ne baisse jamais, collecter les frais
 * n'y touche pas, et la graduation ne déplace rien du tout.
 */
contract RevealLockerTest is RevealBase {
    function _tokenId() internal view returns (uint256 id) {
        (, id,,,,,) = launcher.launches(address(token));
    }

    // ------------------------------------------------------- propriété du NFT

    function test_LockerOwnsThePositionForever() public view {
        assertEq(locker.positionOwner(address(token)), address(locker), "proprietaire inattendu");
    }

    function test_NobodyCanTransferThePositionOut() public {
        uint256 id = _tokenId();
        address attacker = makeAddr("attacker");

        vm.prank(attacker);
        vm.expectRevert();
        IERC721(address(manager)).transferFrom(address(locker), attacker, id);

        // Ni le créateur, ni la trésorerie, ni le launcher.
        for (uint256 i = 0; i < 3; i++) {
            address who = [creator, treasury, address(launcher)][i];
            vm.prank(who);
            vm.expectRevert();
            IERC721(address(manager)).transferFrom(address(locker), who, id);
        }

        assertEq(IERC721(address(manager)).ownerOf(id), address(locker), "le NFT a bouge");
    }

    function test_NobodyCanMakeTheLockerApproveThePosition() public {
        uint256 id = _tokenId();
        assertEq(
            IERC721(address(manager)).getApproved(id), address(0), "une approbation existe"
        );
        assertFalse(
            IERC721(address(manager)).isApprovedForAll(address(locker), creator),
            "une approbation globale existe"
        );
    }

    function test_OnlyTheLauncherCanRegister() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(RevealLocker.OnlyLauncher.selector);
        locker.register(address(1), address(2), 1, -200, 200, 1, address(3), true);
    }

    function test_TheLockerRefusesNftsFromAnyoneButTheManager() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(RevealLocker.OnlyPositionManager.selector);
        locker.onERC721Received(address(0), address(0), 1, "");
    }

    // ------------------------------------------------------------------ frais

    function test_CollectingFeesPaysTheTreasuryAndLeavesLiquidityUntouched() public {
        _pastRamp();
        _buy(whale, 1 ether);
        _fullyUnlock();
        _sell(whale, token.balanceOf(whale) / 2);

        uint128 before = locker.liquidityNow(address(token));
        uint256 treasuryQuoteBefore = weth.balanceOf(treasury);

        // Permissionless : un inconnu déclenche la collecte, et paie le gas.
        vm.prank(makeAddr("random passer-by"));
        locker.collect(address(token));

        assertEq(
            locker.liquidityNow(address(token)), before, "la liquidite a bouge pendant la collecte"
        );
        assertGt(
            weth.balanceOf(treasury), treasuryQuoteBefore, "la tresorerie n'a rien recu"
        );
        assertEq(
            locker.positionOwner(address(token)), address(locker), "le NFT a bouge pendant la collecte"
        );
    }

    function test_FeesAlwaysGoToTheTreasuryEvenWhenSomeoneElseCollects() public {
        _pastRamp();
        _buy(whale, 1 ether);
        _fullyUnlock();
        _sell(whale, token.balanceOf(whale) / 2);

        address grabber = makeAddr("grabber");
        uint256 grabberBefore = weth.balanceOf(grabber);

        vm.prank(grabber);
        locker.collect(address(token));

        assertEq(weth.balanceOf(grabber), grabberBefore, "le collecteur a touche quelque chose");
    }

    function test_CollectOnAnUnknownTokenReverts() public {
        vm.expectRevert(RevealLocker.UnknownToken.selector);
        locker.collect(makeAddr("not a launch"));
    }

    // ------------------------------------------------------------ graduation

    function test_ProgressStartsAtZeroAndGrowsWithBuys() public {
        assertEq(locker.graduationProgress(address(token)), 0, "progression non nulle au depart");

        _pastRamp();
        _buy(alice, 1 ether);

        uint256 progress = locker.graduationProgress(address(token));
        assertGt(progress, 0, "la progression n'a pas bouge");
        // Un achat d'un ether laisse un peu moins d'un ether dans la position :
        // le palier prend 1 % au passage.
        assertLt(progress, 1 ether, "la position contient plus que ce qui est entre");
        assertGt(progress, 0.97 ether, "la position contient bien moins que l'achat");
    }

    function test_NotGraduatedBelowTheThreshold() public {
        _pastRamp();
        _buy(whale, 1 ether);

        assertFalse(locker.graduated(address(token)), "graduation prematuree");
        vm.expectRevert(
            abi.encodeWithSelector(
                RevealLocker.NotGraduatedYet.selector,
                locker.graduationProgress(address(token))
            )
        );
        locker.syncGraduation(address(token));
    }

    function test_GraduatesOnceAboveTheThreshold() public {
        _pastRamp();
        _buy(whale, 5 ether);

        uint256 progress = locker.graduationProgress(address(token));
        assertGe(progress, locker.GRADUATION_QUOTE(), "seuil non atteint");

        vm.expectEmit(true, true, false, true, address(locker));
        emit RevealLocker.Graduated(address(token), address(pool), progress);
        locker.syncGraduation(address(token));

        assertTrue(locker.graduated(address(token)), "graduation non enregistree");

        // Une seconde fois : refusée, donc l'événement ne peut pas se répéter.
        vm.expectRevert(RevealLocker.AlreadyGraduated.selector);
        locker.syncGraduation(address(token));
    }

    /// Graduer ne migre rien : même pool, mêmes ticks, même liquidité, même NFT.
    function test_GraduationMovesNothing() public {
        _pastRamp();
        _buy(whale, 5 ether);

        (address poolBefore,, uint128 liqBefore, int24 lowBefore, int24 highBefore,,) =
            launcher.launches(address(token));
        (uint160 sqrtBefore,,,,,,) = pool.slot0();
        uint256 poolTokensBefore = token.balanceOf(address(pool));
        uint256 poolQuoteBefore = weth.balanceOf(address(pool));

        locker.syncGraduation(address(token));

        (address poolAfter,, uint128 liqAfter, int24 lowAfter, int24 highAfter,,) =
            launcher.launches(address(token));
        (uint160 sqrtAfter,,,,,,) = pool.slot0();

        assertEq(poolAfter, poolBefore, "le pool a change");
        assertEq(liqAfter, liqBefore, "la liquidite a change");
        assertEq(lowAfter, lowBefore, "le bord bas a change");
        assertEq(highAfter, highBefore, "le bord haut a change");
        assertEq(sqrtAfter, sqrtBefore, "le prix a change");
        assertEq(token.balanceOf(address(pool)), poolTokensBefore, "les reserves ont bouge");
        assertEq(weth.balanceOf(address(pool)), poolQuoteBefore, "les reserves ont bouge");
        assertEq(locker.liquidityNow(address(token)), liqBefore, "la position a bouge");
        assertEq(locker.positionOwner(address(token)), address(locker), "le NFT a bouge");
    }

    /**
     * Le point qui distingue cette implémentation d'un simple
     * `WETH.balanceOf(pool)` : un virement direct au pool ne gradue rien.
     */
    function test_ADonationCannotTriggerGraduation() public {
        _pastRamp();
        _buy(whale, 1 ether);

        uint256 before = locker.graduationProgress(address(token));

        // Dix ethers offerts au pool, largement au-dessus du seuil.
        address donor = makeAddr("donor");
        _giveWeth(donor, 10 ether);
        vm.prank(donor);
        weth.transfer(address(pool), 10 ether);

        assertGt(weth.balanceOf(address(pool)), locker.GRADUATION_QUOTE(), "le don n'a pas eu lieu");
        assertEq(
            locker.graduationProgress(address(token)),
            before,
            "un don a bouge la progression de graduation"
        );

        vm.expectRevert(
            abi.encodeWithSelector(RevealLocker.NotGraduatedYet.selector, before)
        );
        locker.syncGraduation(address(token));
    }

    function test_GraduationOfAnUnknownTokenReverts() public {
        vm.expectRevert(RevealLocker.UnknownToken.selector);
        locker.graduationProgress(makeAddr("not a launch"));
    }

    /* ------------------------- partage des frais ------------------------- */

    /**
     * Amène des frais des deux côtés : un achat les fait payer en quote, une
     * vente les fait payer en token. Sans les deux, le partage ne se voit pas.
     */
    function _accrueBothSides() internal {
        _pastRamp();
        _buy(whale, 1 ether);
        _fullyUnlock();
        _sell(whale, token.balanceOf(whale) / 2);
    }

    function test_TheTokenSideGoesToTheCreator() public {
        _accrueBothSides();

        uint256 creatorBefore = token.balanceOf(creator);
        uint256 treasuryTokensBefore = token.balanceOf(treasury);

        locker.collect(address(token));

        assertGt(token.balanceOf(creator), creatorBefore, "le createur n'a rien recu");
        assertEq(
            token.balanceOf(treasury),
            treasuryTokensBefore,
            "la tresorerie recoit encore des tokens"
        );
    }

    function test_TheQuoteSideStillGoesToTheTreasury() public {
        _accrueBothSides();

        uint256 treasuryBefore = weth.balanceOf(treasury);
        uint256 creatorQuoteBefore = weth.balanceOf(creator);

        locker.collect(address(token));

        assertGt(weth.balanceOf(treasury), treasuryBefore, "la tresorerie n'a rien recu");
        assertEq(
            weth.balanceOf(creator), creatorQuoteBefore, "le createur a touche de la quote"
        );
    }

    /**
     * Le point qui rend le partage acceptable : le créateur reçoit ses frais
     * comme n'importe qui reçoit un achat. Pas de dispense, pas de sortie
     * anticipée.
     */
    function test_TheCreatorsFeeTokensAreLockedLikeAnyBuy() public {
        _accrueBothSides();

        assertEq(token.balanceOf(creator), 0, "le socle suppose un createur sans position");
        locker.collect(address(token));

        uint256 received = token.balanceOf(creator);
        assertGt(received, 0, "rien a mesurer");
        assertApproxEqAbs(
            token.releasable(creator),
            received / 10,
            1,
            "le createur echappe au deblocage initial"
        );
        assertEq(token.unlockedBps(creator), 1_000, "le createur echappe au calendrier");
    }

    /// N'importe qui déclenche, et les deux destinataires sont payés pareil.
    function test_AStrangerCollectingPaysBothSides() public {
        _accrueBothSides();

        address stranger = makeAddr("passer-by");
        uint256 treasuryBefore = weth.balanceOf(treasury);
        uint256 creatorBefore = token.balanceOf(creator);

        vm.prank(stranger);
        locker.collect(address(token));

        assertGt(weth.balanceOf(treasury), treasuryBefore, "tresorerie non payee");
        assertGt(token.balanceOf(creator), creatorBefore, "createur non paye");
        assertEq(weth.balanceOf(stranger), 0, "le collecteur a touche de la quote");
        assertEq(token.balanceOf(stranger), 0, "le collecteur a touche des tokens");
    }

    /**
     * Le locker ne détient rien, à aucun instant. C'est ce qui lui évite d'avoir
     * à sortir d'une position, donc de réclamer une dispense du verrou.
     */
    function test_TheLockerHoldsNeitherSideAfterCollecting() public {
        _accrueBothSides();
        locker.collect(address(token));

        assertEq(weth.balanceOf(address(locker)), 0, "de la quote est restee");
        assertEq(token.balanceOf(address(locker)), 0, "des tokens sont restes");
    }

    /// Et la position elle-même n'a pas bougé d'un wei.
    function test_TheSplitLeavesThePositionUntouched() public {
        _accrueBothSides();

        uint128 before = locker.liquidityNow(address(token));
        locker.collect(address(token));

        assertEq(locker.liquidityNow(address(token)), before, "la liquidite a bouge");
        assertEq(
            locker.positionOwner(address(token)), address(locker), "le NFT a bouge"
        );
    }
}
