// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";

/**
 * Le drawdown relief, et la façon dont il se laissait offrir.
 *
 * Le relief compare le prix d'entrée d'une position au prix courant : plus la
 * position est en perte, plus elle se libère vite, et une division par deux
 * libère tout. Les deux bouts de cette comparaison doivent être mesurés de la
 * même manière — c'est là que se trouvait le défaut.
 *
 * L'entrée était relevée au *spot*, immédiatement après le swap, donc au prix
 * marginal que l'acheteur venait de pousser. Le prix courant, lui, est le TWAP
 * sur cinq minutes, qui retarde par construction. Un achat assez gros pour
 * bouger le tick de plus de 6 932 pas — une multiplication du prix par deux,
 * ce qui n'a rien d'extraordinaire sur un pool unilatéral qui démarre — se
 * retrouvait donc, dans le même bloc, réputé avoir perdu la moitié de sa valeur.
 * Il obtenait 100 % de relief instantanément et sortait du calendrier de
 * déblocage tout entier.
 *
 * Le prix n'avait pas baissé. C'est la référence qui n'avait pas encore bougé.
 */
contract RevealReliefTest is RevealBase {
    function test_ABigBuyDoesNotUnlockItself() public {
        _pastRamp();
        _buy(whale, 1 ether);

        assertEq(
            token.unlockedBps(whale),
            _initialUnlockBps(),
            "un achat s'est accorde du relief a lui-meme"
        );
        assertEq(token.drawdownTicks(whale), 0, "perte latente fabriquee par l'achat");

        // Ce qui compte vraiment : la part vendable.
        uint256 held = token.balanceOf(whale);
        assertApproxEqRel(
            token.releasable(whale),
            (held * _initialUnlockBps()) / BPS,
            1e12,
            "un achat s'est rendu integralement vendable"
        );
    }

    /// Le même piège, en plus gros : plus l'achat est violent, plus il payait.
    function test_AHugeBuyDoesNotUnlockItself() public {
        _pastRamp();
        _buy(whale, 20 ether);

        assertLt(
            token.unlockedBps(whale),
            2 * _initialUnlockBps(),
            "un achat massif s'est accorde du relief"
        );
    }

    /// Une vraie baisse, elle, doit bien libérer.
    function test_ARealPriceFallStillGrantsRelief() public {
        _pastRamp();
        _buy(whale, 4 ether);
        _buy(alice, 0.05 ether);

        // Le temps que le TWAP rattrape l'achat, sans quoi on mesurerait encore
        // le retard de l'oracle plutot qu'un mouvement de prix.
        _warp(10 minutes);
        uint256 quiet = token.drawdownTicks(alice);

        // La baleine sort, le prix s'effondre.
        _warp(1 hours);
        _sell(whale, token.balanceOf(whale));
        _warp(10 minutes);

        assertGt(
            token.drawdownTicks(alice),
            quiet,
            "une chute reelle du prix n'ouvre aucun relief"
        );
        assertGt(token.unlockedBps(alice), _initialUnlockBps(), "le relief ne s'applique pas");
    }

    /// Aucun relief tant que l'oracle n'a pas au moins une fenêtre d'historique
    /// depuis l'entrée : sinon les deux bouts de la comparaison se chevauchent.
    function test_NoReliefBeforeTheOracleHasAWindow() public {
        _pastRamp();
        _buy(alice, 1 ether);

        assertEq(token.drawdownTicks(alice), 0, "relief accorde sans historique");
        _warp(4 minutes);
        assertEq(token.drawdownTicks(alice), 0, "relief accorde avant la fin de la fenetre");
    }
}
