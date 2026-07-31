// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealToken} from "../src/RevealToken.sol";

/**
 * Les deux portes, prises une par une.
 *
 * Les achats venant du pool sont simulés par un transfert direct depuis
 * l'adresse du pool : c'est exactement ce que le hook voit quand un vrai
 * routeur exécute un ordre, et c'est la seule façon de lire le motif du refus.
 * Passé par un routeur, Uniswap emballe le transfert et tout échec ressort en
 * « TF » — d'où l'existence des vues `maxBuyNow` et `releasable`.
 */
contract RevealGatesTest is RevealBase {
    function _asPool(address to, uint256 amount) internal {
        vm.prank(address(pool));
        token.transfer(to, amount);
    }

    // ------------------------------------------------------- délai de lancement

    function test_BuysAreClosedDuringTheLaunchDelay() public {
        assertEq(token.maxBuyNow(), 0, "maxBuyNow devrait etre nul pendant le delai");
        assertEq(token.buyOpensAt(), token.launchedAt() + 5, "ouverture annoncee incorrecte");

        vm.expectRevert(
            abi.encodeWithSelector(
                RevealToken.LaunchDelayActive.selector, token.launchedAt() + 5
            )
        );
        _asPool(alice, 1e18);
    }

    function test_BuysOpenExactlyWhenAnnounced() public {
        _warp(5);
        assertGt(token.maxBuyNow(), 0, "maxBuyNow toujours nul a l'ouverture");
        _asPool(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18, "l'achat n'est pas passe");
    }

    // ---------------------------------------------------------------- rampe

    function test_TheRampLimitsBuySizeAndSaysSo() public {
        _warp(6);

        uint256 max = token.maxBuyNow();
        assertGt(max, 0, "rampe fermee");
        assertLt(max, SUPPLY, "la rampe ne limite rien");

        // Exactement le plafond : accepté.
        _asPool(alice, max);

        // Un wei de plus : refusé, et le contrat annonce le même chiffre.
        vm.expectRevert(abi.encodeWithSelector(RevealToken.BuyTooLarge.selector, max));
        _asPool(bob, max + 1);
    }

    /// `maxBuyNow` doit dire exactement ce que la porte laisse passer, à tout
    /// instant de la rampe — sinon l'interface annonce des refus ou des succès
    /// qui n'arrivent pas.
    function test_MaxBuyNowMatchesWhatTheGateAllows() public {
        uint256[4] memory moments = [uint256(6), 1 minutes, 5 minutes, 10 minutes + 1];

        for (uint256 i = 0; i < moments.length; i++) {
            uint256 snapshot = vm.snapshotState();
            _warp(moments[i]);

            uint256 max = token.maxBuyNow();
            // Le pool ne détient pas tout à fait la supply : la poussière
            // d'arrondi du mint est restée au launcher. La porte autorise `max`,
            // mais on ne peut transférer que ce qui existe.
            uint256 available = token.balanceOf(address(pool));
            _asPool(alice, max > available ? available : max);

            if (max < SUPPLY) {
                vm.expectRevert(abi.encodeWithSelector(RevealToken.BuyTooLarge.selector, max));
                _asPool(bob, max + 1);
            }
            vm.revertToState(snapshot);
        }
    }

    function test_TheRampFullyOpensAtItsEnd() public {
        _pastRamp();
        assertEq(token.maxBuyNow(), token.totalSupply(), "la rampe ne s'ouvre pas entierement");
    }

    // ------------------------------------------------------------ déblocage

    function test_ASellBeyondTheReleasedAmountIsRefusedWithTheAmount() public {
        _pastRamp();
        _buy(alice, 0.5 ether);

        uint256 free = token.releasable(alice);
        vm.expectRevert(abi.encodeWithSelector(RevealToken.PositionLocked.selector, free));
        _sellRaw(alice, free + 1);
    }

    function test_ReleasableGrowsWithTime() public {
        _pastRamp();
        _buy(alice, 0.5 ether);

        uint256 atStart = token.releasable(alice);
        _warp(30 minutes);
        uint256 halfway = token.releasable(alice);
        _warp(30 minutes + 1);

        assertGt(halfway, atStart, "le temps ne libere rien");
        assertEq(token.releasable(alice), token.balanceOf(alice), "tout n'est pas libere a la fin");
    }

    function test_InitialUnlockIsExactlyWhatTheRulesSay() public {
        _pastRamp();
        _buy(alice, 0.5 ether);

        assertApproxEqRel(
            token.releasable(alice),
            (token.balanceOf(alice) * _initialUnlockBps()) / BPS,
            1e12,
            "le deblocage initial ne correspond pas aux regles"
        );
    }

    // -------------------------------------------------------------- trésorerie

    /**
     * Les frais versés à la trésorerie ne passent pas par la rampe : la
     * collecte est permissionless et ne doit pas dépendre de l'heure. Elle
     * ouvre en revanche bien une position, donc le protocole reste soumis à ses
     * propres règles de sortie.
     */
    function test_FeeTransfersToTheTreasuryEscapeTheRampButNotTheUnlock() public {
        // Encore dans le délai de lancement : un achat normal serait refusé.
        _asPool(treasury, 1e24);
        assertEq(token.balanceOf(treasury), 1e24, "la tresorerie n'a pas ete servie");

        assertLt(
            token.releasable(treasury),
            token.balanceOf(treasury),
            "la tresorerie echappe au deblocage"
        );
    }

    // ------------------------------------------------------------- lecture

    function test_RulesAreReadableAndImmutable() public view {
        (uint16 initialUnlockBps, uint32 unlockSeconds, uint32 launchDelay, uint32 buyRamp) =
            token.rules();

        assertEq(initialUnlockBps, 1_000, "deblocage initial");
        assertEq(unlockSeconds, 1 hours, "fenetre de deblocage");
        assertEq(launchDelay, 5, "delai de lancement");
        assertEq(buyRamp, 10 minutes, "duree de rampe");
    }

    function test_OnlyTheLauncherCanInitialize() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(RevealToken.OnlyLauncher.selector);
        token.initialize(address(pool), address(weth), treasury);
    }

    function test_InitializeCannotRun_Twice() public {
        vm.prank(address(launcher));
        vm.expectRevert(RevealToken.AlreadyInitialized.selector);
        token.initialize(address(pool), address(weth), treasury);
    }
}
