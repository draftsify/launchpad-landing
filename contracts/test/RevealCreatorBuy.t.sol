// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";

/**
 * Le dev buy : ce qu'il donne au créateur, et surtout ce qu'il ne donne pas.
 *
 * C'est le seul privilège du protocole, donc celui qui mérite le plus de tests
 * hostiles. Chacun de ceux-ci a été écrit pour tenter d'en tirer plus que ce
 * qui est annoncé.
 *
 * Note de lecture, valable partout ici : Uniswap emballe ses transferts, donc
 * nos motifs de revert n'en sortent pas — un achat refusé par le token remonte
 * en « TF ». C'est la propriété qui oblige l'interface à lire les vues avant de
 * signer, et elle vaut aussi pour ces tests.
 */
contract RevealCreatorBuyTest is RevealBase {
    /// Le lancement du socle est sans dev buy : chaque test monte le sien.
    function _launchWithBuy(uint256 value)
        internal
        returns (RevealToken t, IUniswapV3Pool p)
    {
        vm.deal(creator, value);
        vm.prank(creator);
        (address a, address b) =
            launcher.launchWithBuy{value: value}("Dev", "DEV", METADATA_URI);
        t = RevealToken(a);
        p = IUniswapV3Pool(b);
    }

    function test_TheCreatorEndsUpHoldingTheFirstPosition() public {
        (RevealToken t,) = _launchWithBuy(0.02 ether);

        assertGt(t.balanceOf(creator), 0, "le createur n'a rien recu");
        assertEq(t.creator(), creator, "createur mal enregistre");
        assertEq(t.creatorBought(), t.balanceOf(creator), "compteur desaccorde");
    }

    /// Le point qui compte : acheter plus tôt n'est pas vendre plus tôt.
    function test_TheDevBuyIsLockedLikeAnyOtherBuy() public {
        (RevealToken t,) = _launchWithBuy(0.02 ether);

        uint256 held = t.balanceOf(creator);
        // Un wei de tolérance : la part verrouillée est arrondie vers le haut,
        // délibérément, donc la part libre peut valoir un wei de moins que le
        // dixième exact. L'arrondi va contre le détenteur, ce qui est le bon
        // sens pour une contrainte.
        assertApproxEqAbs(
            t.releasable(creator),
            held / 10,
            1,
            "le dev buy ne suit pas le deblocage initial de 10 %"
        );
        assertEq(t.unlockedBps(creator), 1_000, "le createur echappe au calendrier");
    }

    function test_EverythingOpensAtFifteenMinutes() public {
        (RevealToken t,) = _launchWithBuy(0.02 ether);

        vm.warp(block.timestamp + 15 minutes + 1);
        assertEq(
            t.releasable(creator),
            t.balanceOf(creator),
            "tout n'est pas ouvert au quart d'heure"
        );
    }

    /**
     * Le plafond, éprouvé par le haut. Un achat qui dépasserait cinq pour cent
     * de la supply doit faire échouer le lancement entier plutôt que d'être
     * silencieusement rogné : un lancement à moitié fait serait pire.
     */
    function test_TheCapHoldsAgainstAnEnormousBuy() public {
        vm.deal(creator, 100 ether);
        vm.prank(creator);
        vm.expectRevert(bytes("TF"));
        launcher.launchWithBuy{value: 100 ether}("Dev", "DEV", METADATA_URI);
    }

    function test_TheCapIsFivePercentOfSupply() public view {
        assertEq(launcher.creatorBuyCap(), (SUPPLY * 500) / 10_000, "plafond annonce");
        assertEq(RevealToken(address(token)).CREATOR_BUY_MAX_BPS(), 500, "bps du plafond");
    }

    /**
     * Le plafond est cumulé, pas par transaction. Sans cela, plusieurs achats
     * dans le bloc du lancement le contourneraient entièrement — c'est
     * exactement ce que ce test tente.
     */
    function test_TheCapIsCumulativeWithinTheLaunchBlock() public {
        (RevealToken t, IUniswapV3Pool p) = _launchWithBuy(0.02 ether);

        uint256 first = t.balanceOf(creator);
        assertLt(first, launcher.creatorBuyCap(), "le premier achat sature deja");

        // Toujours le même bloc : la fenêtre du créateur est encore ouverte.
        vm.deal(creator, 100 ether);
        vm.startPrank(creator);
        weth.deposit{value: 100 ether}();
        weth.approve(address(router), type(uint256).max);
        vm.stopPrank();

        // La lecture est sortie de la liste d'arguments : expectRevert vise le
        // prochain appel, et un tokenIsToken0() glissé là serait celui-là — il
        // réussirait, et le test échouerait en accusant la mauvaise ligne.
        bool zeroForOne = !t.tokenIsToken0();
        vm.expectRevert(bytes("TF"));
        router.swap(address(p), creator, zeroForOne, int256(uint256(100 ether)));
    }

    /// Et ce qui reste sous le plafond passe, dans ce même bloc.
    function test_WhatFitsUnderTheCapStillGoesThrough() public {
        (RevealToken t, IUniswapV3Pool p) = _launchWithBuy(0.001 ether);

        uint256 before = t.balanceOf(creator);
        vm.deal(creator, 0.001 ether);
        vm.startPrank(creator);
        weth.deposit{value: 0.001 ether}();
        weth.approve(address(router), type(uint256).max);
        vm.stopPrank();

        router.swap(address(p), creator, !t.tokenIsToken0(), int256(uint256(0.001 ether)));
        assertGt(t.balanceOf(creator), before, "le second achat n'a rien ajoute");
        assertLe(t.creatorBought(), launcher.creatorBuyCap(), "le plafond a saute");
    }

    /**
     * La fenêtre est celle du bloc de lancement, et rien d'autre. Une seconde
     * plus tard le créateur redevient un acheteur comme les autres — donc
     * soumis au délai anti-sniper, qui n'est pas écoulé.
     */
    function test_TheWindowClosesWithTheLaunchBlock() public {
        (RevealToken t, IUniswapV3Pool p) = _launchWithBuy(0.001 ether);

        vm.warp(block.timestamp + 1);
        assertEq(t.creatorBuyRemaining(), 0, "la fenetre est encore ouverte");

        vm.deal(creator, 1 ether);
        vm.startPrank(creator);
        weth.deposit{value: 1 ether}();
        weth.approve(address(router), type(uint256).max);
        vm.stopPrank();

        bool zeroForOne = !t.tokenIsToken0();
        vm.expectRevert(bytes("TF"));
        router.swap(address(p), creator, zeroForOne, int256(uint256(1 ether)));
    }

    /// Personne d'autre ne profite de la fenêtre, pas même dans le même bloc.
    function test_AStrangerCannotBuyInTheLaunchBlock() public {
        (RevealToken t, IUniswapV3Pool p) = _launchWithBuy(0.001 ether);

        vm.deal(alice, 0.001 ether);
        vm.startPrank(alice);
        weth.deposit{value: 0.001 ether}();
        weth.approve(address(router), type(uint256).max);
        vm.stopPrank();

        bool zeroForOne = !t.tokenIsToken0();
        vm.expectRevert(bytes("TF"));
        router.swap(address(p), alice, zeroForOne, int256(uint256(0.001 ether)));
    }

    function test_ALaunchWithoutADevBuyGrantsNothing() public {
        // `token` vient du socle, lancé par `launch()` sans valeur.
        assertEq(token.balanceOf(creator), 0, "le createur detient des tokens");
        assertEq(token.creatorBought(), 0, "compteur non nul");
        assertEq(token.creator(), creator, "le createur doit rester connu");
    }

    function test_AZeroValueDevBuyIsRefused() public {
        vm.prank(creator);
        vm.expectRevert(RevealLauncher.NoCreatorBuy.selector);
        launcher.launchWithBuy{value: 0}("Dev", "DEV", METADATA_URI);
    }

    /**
     * Le rappel de swap est une fonction publique : quiconque l'appelle hors
     * d'un swap que nous avons déclenché doit être refusé. Sans ce verrou, une
     * fausse paire nous ferait payer un échange qui n'est pas le nôtre.
     */
    function test_TheSwapCallbackRefusesStrangers() public {
        vm.prank(makeAddr("faux pool"));
        vm.expectRevert(
            abi.encodeWithSelector(
                RevealLauncher.UnexpectedCallback.selector, makeAddr("faux pool")
            )
        );
        launcher.uniswapV3SwapCallback(1 ether, 0, abi.encode(true));
    }

    /**
     * Le launcher ne doit rien détenir de la valeur du créateur.
     *
     * Zéro pour la quote et pour l'ether : tout ce qui est entré est reparti,
     * soit dans le pool, soit remboursé. Les tokens font exception et c'est
     * antérieur au dev buy — l'amorçage laisse la poussière d'arrondi entier de
     * la position, quelques milliers de wei sur un milliard de tokens. Elle est
     * inatteignable et bornée par `_assertSeeded`, donc on vérifie la borne
     * plutôt que de prétendre qu'elle n'existe pas.
     */
    function test_TheLauncherKeepsNothingOfWhatTheCreatorPaid() public {
        (RevealToken t,) = _launchWithBuy(0.05 ether);

        assertEq(weth.balanceOf(address(launcher)), 0, "de la quote est restee");
        assertEq(address(launcher).balance, 0, "de l'ether est reste");
        assertLt(
            t.balanceOf(address(launcher)),
            SUPPLY / 1e9,
            "il reste plus que la poussiere d'amorcage"
        );
    }

    /// La courbe ne doit pas bouger : un dev buy est un achat, pas un réglage.
    function test_TheCurveIsUntouchedByADevBuy() public {
        (RevealToken t,) = _launchWithBuy(0.02 ether);

        assertEq(
            launcher.expectedLiquidity(t.tokenIsToken0()),
            PONS_LIQUIDITY,
            "la liquidite posee n'est plus celle de reference"
        );
    }
}
