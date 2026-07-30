// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealToken} from "../src/RevealToken.sol";

/**
 * La comptabilité des positions, cas par cas.
 *
 * Le premier test de ce fichier a d'abord échoué : c'est le défaut signalé par
 * la revue externe. Un rachat après une sortie quasi totale commençait à zéro
 * releasable, alors que le protocole promet 10 % à tout achat — la dette de
 * déblocage de l'ancienne position survivait à la sortie tandis que
 * l'ancienneté, elle, était remoyennée vers le nouvel achat.
 *
 * Les suivants sont la liste que la revue demande de couvrir.
 */
contract RevealRegressionsTest is RevealBase {
    /// L'invariant central, sous la forme exacte où la revue l'énonce.
    function _assertBuyKeepsItsInitialUnlock(
        address who,
        uint256 releasableBefore,
        uint256 acquired
    ) internal view {
        assertGe(
            token.releasable(who),
            releasableBefore + (acquired * _initialUnlockBps()) / BPS,
            "un achat doit ajouter son deblocage initial a ce qui etait deja libre"
        );
    }

    // ------------------------------------------------ rachats et dette morte

    function test_RebuyAfterNearTotalExitKeepsItsInitialUnlock() public {
        _pastRamp();
        _buy(alice, 0.5 ether);
        uint256 firstBuy = token.balanceOf(alice);

        _fullyUnlock();
        vm.prank(alice);
        token.transfer(bob, firstBuy - 1);
        assertEq(token.balanceOf(alice), 1, "il doit rester exactement 1 wei");

        uint256 before = token.releasable(alice);
        uint256 heldBefore = token.balanceOf(alice);

        _buy(alice, 0.5 ether);
        _assertBuyKeepsItsInitialUnlock(alice, before, token.balanceOf(alice) - heldBefore);
    }

    function test_RebuyAfterCompleteExitKeepsItsInitialUnlock() public {
        _pastRamp();
        _buy(alice, 0.5 ether);

        _fullyUnlock();
        // `balanceOf` est un appel : le lire dans les arguments consommerait le
        // prank, et le transfert partirait du contrat de test.
        uint256 all = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, all);
        assertEq(token.balanceOf(alice), 0, "solde non nul");

        _buy(alice, 0.5 ether);
        _assertBuyKeepsItsInitialUnlock(alice, 0, token.balanceOf(alice));
    }

    /// Un solde ramené exactement à zéro doit effacer la tranche.
    function test_BalanceBackToZeroClearsThePosition() public {
        _pastRamp();
        _buy(alice, 0.5 ether);
        _fullyUnlock();

        uint256 all = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, all);

        (uint64 lockStart, int24 lockTick, uint128 lockedBasis) = token.positions(alice);
        assertEq(lockedBasis, 0, "tranche non effacee");
        assertEq(lockStart, 0, "horloge non effacee");
        assertEq(lockTick, 0, "tick non efface");
    }

    /// Cycles répétés : l'invariant tient à chaque tour, pas seulement au premier.
    function test_RepeatedBuySellCyclesKeepTheirInitialUnlock() public {
        _pastRamp();

        for (uint256 i = 0; i < 5; i++) {
            uint256 before = token.releasable(alice);
            uint256 heldBefore = token.balanceOf(alice);

            _buy(alice, 0.2 ether);
            uint256 acquired = token.balanceOf(alice) - heldBefore;
            _assertBuyKeepsItsInitialUnlock(alice, before, acquired);

            // On revend précisément ce qui est libre, puis on laisse le temps
            // rouvrir la tranche restante.
            uint256 free = token.releasable(alice);
            if (free > 0) _sell(alice, free);
            _warp(20 minutes);
        }
    }

    // ---------------------------------------------- sorties et budget consommé

    function test_OutgoingTransferNeverRecreatesBudget() public {
        _pastRamp();
        _buy(alice, 0.5 ether);

        uint256 before = token.releasable(alice);
        vm.prank(alice);
        token.transfer(bob, before);

        assertLe(token.releasable(alice), before, "un transfert sortant a recree du budget");
    }

    /// Transférer exactement la part libérée d'une position encore verrouillée.
    function test_TransferringExactlyTheReleasedPortionSucceedsAndNoMore() public {
        _pastRamp();
        _buy(alice, 0.5 ether);

        uint256 free = token.releasable(alice);
        assertGt(free, 0, "rien de libere");

        vm.prank(alice);
        token.transfer(bob, free);
        assertEq(token.releasable(alice), 0, "il reste du budget apres l'avoir tout consomme");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RevealToken.PositionLocked.selector, 0));
        token.transfer(bob, 1);
    }

    /// Ce qui sort était déjà libre : le destinataire le reçoit libre.
    function test_FullyUnlockedTokensTravelFreeToAFreshWallet() public {
        _pastRamp();
        _buy(alice, 0.5 ether);
        _fullyUnlock();

        uint256 all = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, all);

        assertEq(token.releasable(bob), all, "un solde recu doit etre integralement libre");
        assertEq(token.lockedOf(bob), 0, "recevoir un token ne doit rien verrouiller");
    }

    /// Recevoir après être sorti d'une position ne ressuscite aucune dette.
    function test_ReceivingAfterAnExitedPositionIsFree() public {
        _pastRamp();
        _buy(alice, 0.5 ether);
        _fullyUnlock();

        uint256 all = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(bob, all);

        // Bob renvoie tout à Alice, qui est sortie.
        uint256 back = token.balanceOf(bob);
        vm.prank(bob);
        token.transfer(alice, back);

        assertEq(
            token.releasable(alice),
            token.balanceOf(alice),
            "un solde recu apres sortie doit etre libre"
        );
    }

    /// Un nouvel achat ne doit pas reverrouiller un ancien solde déjà libre.
    function test_NewBuyDoesNotRelockOldUnlockedBalance() public {
        _pastRamp();
        _buy(alice, 0.5 ether);
        _fullyUnlock();

        uint256 oldFree = token.releasable(alice);
        assertEq(oldFree, token.balanceOf(alice), "l'ancien solde devrait etre entierement libre");

        uint256 heldBefore = token.balanceOf(alice);
        _buy(alice, 0.5 ether);
        uint256 acquired = token.balanceOf(alice) - heldBefore;

        assertGe(
            token.releasable(alice),
            oldFree,
            "un achat a reduit ce qui etait deja libre"
        );
        _assertBuyKeepsItsInitialUnlock(alice, oldFree, acquired);
    }

    // ------------------------------------------------------------- échéances

    /// Chaque acquisition est intégralement libérée à son échéance annoncée.
    function test_EveryAcquisitionUnlocksByItsDeadline() public {
        _pastRamp();
        _buy(alice, 0.3 ether);
        _warp(30 minutes);
        _buy(alice, 0.3 ether);

        // Une heure après le *dernier* achat, plus rien ne doit être bloqué.
        _warp(1 hours + 1);
        assertEq(token.lockedOf(alice), 0, "une tranche survit a son echeance");
        assertEq(token.releasable(alice), token.balanceOf(alice), "solde non entierement libre");
    }

    // ------------------------------------------------------- bords a un wei

    function test_OneWeiBoundaries() public {
        _pastRamp();
        _buy(alice, 0.5 ether);

        uint256 free = token.releasable(alice);
        vm.prank(alice);
        token.transfer(bob, free - 1);

        // Il reste exactement un wei de budget.
        assertEq(token.releasable(alice), 1, "le dernier wei de budget a disparu");
        vm.prank(alice);
        token.transfer(bob, 1);
        assertEq(token.releasable(alice), 0, "budget non nul apres consommation totale");
    }

    /// Le plafond d'impact a été retiré : un solde entièrement débloqué se vend
    /// d'un bloc, sans fenêtre ni pourcentage de réserve.
    function test_FullyUnlockedBalanceSellsInOneGo() public {
        _pastRamp();
        _buy(whale, 2 ether);
        _fullyUnlock();

        uint256 all = token.balanceOf(whale);
        _sell(whale, all);
        assertEq(token.balanceOf(whale), 0, "la vente integrale n'est pas passee");
    }
}
