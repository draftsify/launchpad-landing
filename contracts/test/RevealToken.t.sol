// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {Rules, RevealRules} from "../src/libraries/RevealRules.sol";

contract RevealTokenTest is RevealBase {
    // ------------------------------------------------------------ lancement

    function test_LaunchSeedsPoolAndBurnsLiquidity() public view {
        (uint256 rToken, uint256 rWeth) = _reserves();
        assertEq(rToken, SUPPLY, "toute la supply est dans le pool");
        assertEq(rWeth, LIQUIDITY, "la liquidite du createur est dans le pool");

        assertEq(token.balanceOf(creator), 0, "le createur ne garde aucun token");
        assertEq(token.totalSupply(), SUPPLY);
        // Les parts de LP sont irrecuperables : personne ne peut retirer le pool.
        assertGt(
            RevealToken(address(pair)).balanceOf(launcher.BURN()), 0, "LP envoyees au burn"
        );
        assertEq(RevealToken(address(pair)).balanceOf(address(launcher)), 0);
    }

    function test_RulesAreStoredVerbatim() public view {
        (
            uint16 initialUnlockBps,
            uint32 unlockSeconds,
            uint16 impactCapBps,
            uint32 impactWindow,
            uint32 launchDelay,
            uint32 buyRamp
        ) = token.rules();

        Rules memory r = defaultRules();
        assertEq(initialUnlockBps, r.initialUnlockBps);
        assertEq(unlockSeconds, r.unlockSeconds);
        assertEq(impactCapBps, r.impactCapBps);
        assertEq(impactWindow, r.impactWindow);
        assertEq(launchDelay, r.launchDelay);
        assertEq(buyRamp, r.buyRamp);
    }

    function test_InitializeIsSingleShotAndLauncherOnly() public {
        vm.expectRevert(RevealToken.AlreadyInitialized.selector);
        vm.prank(address(launcher));
        token.initialize(address(pair));

        vm.expectRevert(RevealToken.OnlyLauncher.selector);
        vm.prank(alice);
        token.initialize(address(pair));
    }

    // ---------------------------------------------------------- anti-sniper

    function test_LaunchDelayBlocksTheFirstBlocks() public {
        // Le hook revient avant le controle de K : inutile d'alimenter la paire.
        // L'erreur est masquee : v2 emballe le transfert dans `_safeTransfer`,
        // qui remplace toute raison par TRANSFER_FAILED. Voir le test dedie.
        uint256 out = _quoteBuy(0.01 ether);

        vm.expectRevert("UniswapV2: TRANSFER_FAILED");
        _swapTokensOut(alice, out);

        vm.warp(block.timestamp + 30);
        _buy(alice, 0.01 ether);
        assertGt(token.balanceOf(alice), 0, "l'achat passe une fois le delai ecoule");
    }

    function test_BuyRampCapsSizeAtTheExactBound() public {
        uint256 elapsed = 30;
        vm.warp(token.launchedAt() + elapsed);

        (uint256 rToken,) = _reserves();
        uint256 maxBuy = (rToken * RevealRules.rampBps(defaultRules(), elapsed)) / 10_000;

        vm.expectRevert("UniswapV2: TRANSFER_FAILED");
        _swapTokensOut(alice, maxBuy + 1);

        _buyExact(alice, maxBuy);
        assertEq(token.balanceOf(alice), maxBuy, "la borne exacte passe");
    }

    /**
     * Propriete a connaitre cote interface : passe par le pool, aucune de nos
     * erreurs ne remonte. `_safeTransfer` de v2 emballe l'appel et remplace la
     * raison. L'interface doit donc interroger `sellableNow` avant d'envoyer
     * une transaction, et non tenter puis lire l'echec.
     */
    function test_PoolMasksOurRevertReasons() public {
        _pastRamp();
        _buy(alice, 0.05 ether);
        uint256 tooMuch = token.balanceOf(alice);

        // Appel direct : notre erreur, avec le montant encore disponible.
        uint256 open = token.releasable(alice);
        vm.expectRevert(abi.encodeWithSelector(RevealToken.PositionLocked.selector, open));
        _sendToPair(alice, tooMuch);

        // Le meme refus traverse par le pool : raison generique. On relance un
        // token pour retrouver la phase de rampe, ou un achat est bride.
        _launch(defaultRules());
        vm.warp(token.launchedAt() + 31);

        (uint256 rToken,) = _reserves();
        vm.expectRevert("UniswapV2: TRANSFER_FAILED");
        _swapTokensOut(bob, rToken / 2);
    }

    function test_BuyRampReleasesAtTheEnd() public {
        _pastRamp();
        (uint256 rToken,) = _reserves();

        // Au-dela de la rampe, plus aucun plafond de taille : un achat qui
        // sortirait la moitie du pool passe.
        _buyExact(whale, rToken / 2);
        assertEq(token.balanceOf(whale), rToken / 2);
    }

    // -------------------------------------------------------------- deblocage

    function test_UnlockStartsAtInitialShare() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        assertApproxEqAbs(token.unlockedBps(alice), 1_000, 2, "10 % a l'entree");

        uint256 balance = token.balanceOf(alice);
        assertApproxEqRel(token.releasable(alice), balance / 10, 0.01e18);
    }

    function test_UnlockReachesFullAfterTheWindow() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        vm.warp(block.timestamp + 12 hours);
        assertApproxEqAbs(token.unlockedBps(alice), 5_500, 20, "moitie du chemin a mi-parcours");

        _fullyUnlock();
        assertEq(token.unlockedBps(alice), 10_000, "entierement libere");
    }

    function test_SellAboveUnlockedReverts() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        uint256 balance = token.balanceOf(alice);
        uint256 open = token.releasable(alice);

        vm.expectRevert(abi.encodeWithSelector(RevealToken.PositionLocked.selector, open));
        _sendToPair(alice, (balance * 2) / 10); // 20 % alors que 10 % est ouvert
    }

    /**
     * Le piege du modele naif : si le deblocage se mesurait sur le solde
     * courant, vendre 10 % rouvrirait aussitot 10 % du reste, et une position
     * sortirait entierement en quelques transactions.
     */
    function test_SellingDoesNotReopenTheSameShare() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        uint256 entry = token.balanceOf(alice);
        uint256 tenth = entry / 10;

        _sell(alice, (tenth * 9) / 10); // presque tout le budget
        assertLt(token.releasable(alice), tenth / 5, "le budget ne se reconstitue pas");

        vm.expectRevert();
        _sendToPair(alice, tenth); // deuxieme dixieme : refuse
    }

    function test_PlainTransferConsumesTheSameBudget() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        uint256 entry = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, entry / 10);

        assertEq(token.releasable(alice), 0, "le transfert a consomme le deblocage");
        vm.expectRevert(abi.encodeWithSelector(RevealToken.PositionLocked.selector, 0));
        _sendToPair(alice, entry / 100);
    }

    /**
     * Le contournement evident : eclater la position entre plusieurs adresses.
     * Chaque destinataire repart avec une anciennete nulle, donc au deblocage
     * initial — la manoeuvre coute plus qu'elle ne rapporte.
     */
    function test_SplittingAcrossWalletsDoesNotEscapeUnlock() public {
        _pastRamp();
        _buy(alice, 0.05 ether);
        _fullyUnlock();

        uint256 entry = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, entry);

        assertEq(token.unlockedBps(bob), 1_000, "bob repart au deblocage initial");
        assertApproxEqRel(token.releasable(bob), entry / 10, 0.01e18);
    }

    function test_BuyingAgainAgesThePositionDown() public {
        _pastRamp();
        _buy(alice, 0.05 ether);
        vm.warp(block.timestamp + 12 hours);

        uint256 midway = token.unlockedBps(alice);
        _buy(alice, 0.05 ether); // doubler la position rajeunit la moyenne

        assertLt(token.unlockedBps(alice), midway, "la moyenne d'entree recule");
    }

    // --------------------------------------------------------- plafond d'impact

    /**
     * Le plafond se mesure sur la reserve courante, pas sur une quantite figee :
     * c'est un plafond d'impact. Vendre grossit la reserve en tokens, donc 1 %
     * de cette reserve represente un peu plus qu'avant — la fenetre ne retombe
     * pas exactement a zero, elle retombe au centieme.
     */
    function test_ImpactCapBlocksASecondSellInTheSameWindow() public {
        _pastRamp();
        _buy(whale, 3 ether);
        _fullyUnlock();

        uint256 cap = token.windowRemaining(whale);
        assertGt(cap, 0);

        _sell(whale, cap);
        assertLt(token.windowRemaining(whale), cap / 50, "fenetre pratiquement epuisee");

        vm.expectRevert();
        _sendToPair(whale, cap / 10);
    }

    function test_ImpactCapDecaysAcrossTheWindow() public {
        _pastRamp();
        _buy(whale, 3 ether);
        _fullyUnlock();

        uint256 cap = token.windowRemaining(whale);
        _sell(whale, cap);
        uint256 justAfter = token.windowRemaining(whale);
        assertLt(justAfter, cap / 50);

        // Seau perce : a mi-fenetre, environ la moitie du plafond est revenue.
        vm.warp(block.timestamp + 2 minutes + 30);
        uint256 half = token.windowRemaining(whale);
        assertGt(half, cap / 4, "le plafond se reconstitue progressivement");
        assertLt(half, (cap * 3) / 4);

        vm.warp(block.timestamp + 2 minutes + 31);
        assertGt(token.windowRemaining(whale), half, "puis entierement");
    }

    // ------------------------------------------------------ drawdown relief

    function test_DrawdownReliefRaisesTheFloor() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        uint256 byTimeOnly = token.unlockedBps(alice);
        assertApproxEqAbs(byTimeOnly, 1_000, 50);

        // Le prix perd 40 %, puis une fenetre entiere passe a ce niveau : le
        // TWAP finit par le refleter.
        _crashPrice(6_000);
        vm.warp(block.timestamp + 10 minutes);
        token.syncOracle();

        uint256 drawdown = token.drawdownBps(alice);
        assertGt(drawdown, 3_000, "position nettement en perte");

        // Pente 2x : 40 % de perte ouvrent environ 80 % de la position.
        assertApproxEqAbs(token.unlockedBps(alice), (drawdown * 2), 400);
        assertGt(token.unlockedBps(alice), byTimeOnly, "le relief a releve le plancher");
    }

    function test_ReliefIsAFloorNotABonus() public {
        _pastRamp();
        _buy(alice, 0.05 ether);
        _fullyUnlock();

        assertEq(token.unlockedBps(alice), 10_000);
        _crashPrice(5_000);
        vm.warp(block.timestamp + 10 minutes);
        token.syncOracle();

        assertEq(token.unlockedBps(alice), 10_000, "deja libere : rien a ajouter");
    }

    function test_NoReliefWhenPositionIsUp() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        _buy(whale, 2 ether); // fait monter le prix
        vm.warp(block.timestamp + 10 minutes);
        token.syncOracle();

        assertEq(token.drawdownBps(alice), 0, "en gain : aucune perte latente");
    }

    // ------------------------------------------------------------- validation

    function test_LaunchRejectsWrongLiquidity() public {
        vm.deal(creator, 10 ether);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(RevealLauncher.WrongLiquidity.selector, LIQUIDITY)
        );
        launcher.launch{value: 1 ether}("X", "X", SUPPLY, defaultRules());
    }

    function test_LaunchRejectsImpossibleRules() public {
        Rules memory r = defaultRules();
        r.impactCapBps = 0;

        vm.deal(creator, LIQUIDITY);
        vm.prank(creator);
        vm.expectRevert(RevealRules.ImpactCapOutOfRange.selector);
        launcher.launch{value: LIQUIDITY}("X", "X", SUPPLY, r);
    }

    function test_LaunchRejectsSupplyAboveTheCastBound() public {
        vm.deal(creator, LIQUIDITY);
        vm.prank(creator);
        vm.expectRevert(RevealLauncher.SupplyOutOfRange.selector);
        launcher.launch{value: LIQUIDITY}("X", "X", 1e37, defaultRules());
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_UnlockCurveIsMonotonic(uint32 a, uint32 b) public view {
        a = uint32(bound(a, 0, 30 days));
        b = uint32(bound(b, 0, 30 days));
        if (a > b) (a, b) = (b, a);

        Rules memory r = defaultRules();
        assertLe(RevealRules.timeUnlockedBps(r, a), RevealRules.timeUnlockedBps(r, b));
        assertLe(RevealRules.timeUnlockedBps(r, b), 10_000);
        assertGe(RevealRules.timeUnlockedBps(r, a), r.initialUnlockBps);
    }

    function testFuzz_ReliefNeverExceedsFull(uint256 drawdown) public pure {
        drawdown = bound(drawdown, 0, 10_000);
        assertLe(RevealRules.reliefBps(drawdown), 10_000);
    }

    function testFuzz_SellNeverExceedsWhatTheViewPromised(uint256 wethIn, uint256 wait)
        public
    {
        wethIn = bound(wethIn, 0.001 ether, 1 ether);
        wait = bound(wait, 0, 48 hours);

        _pastRamp();
        _buy(alice, wethIn);
        vm.warp(block.timestamp + wait);

        uint256 promised = token.sellableNow(alice);
        if (promised == 0) return;

        // L'invariant qui compte : ce que la vue annonce s'execute toujours.
        // Un revert ici ferait echouer le test.
        _sell(alice, promised);
        assertLt(token.sellableNow(alice), promised / 20, "budget consomme");
    }
}
