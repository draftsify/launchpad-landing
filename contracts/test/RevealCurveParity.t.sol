// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {INonfungiblePositionManager} from "../src/interfaces/INonfungiblePositionManager.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";
import {PlainToken} from "./mocks/PlainToken.sol";

/**
 * Parité de courbe, démontrée plutôt que supposée.
 *
 * Deux pools sont montés côte à côte : celui d'un lancement Reveal, et celui
 * d'un ERC-20 nu configuré exactement comme le launchpad de référence — même
 * supply, palier 1 %, mêmes ticks, même liquidité. Les mêmes ordres sont
 * exécutés sur les deux, et après chacun on compare prix, tick, réserves,
 * liquidité active et montant sorti.
 *
 * Ce que ça établit : les règles de Reveal *refusent* des échanges, elles n'en
 * *déforment* aucun. Un ordre qui passe bouge le prix au wei près comme il le
 * ferait sur un pool sans aucune règle.
 *
 * Les deux ordres de tokens sont couverts, parce que le prix s'inverse avec eux
 * et que c'est précisément le genre d'asymétrie où une erreur de signe se cache.
 */
contract RevealCurveParityTest is RevealBase {
    /// Les tailles que la revue impose, plus le cumul jusqu'au seuil.
    function _sizes() internal pure returns (uint256[5] memory) {
        return [uint256(0.001 ether), 0.01 ether, 0.1 ether, 1 ether, 4.2 ether];
    }

    struct Pair {
        RevealToken reveal;
        IUniswapV3Pool revealPool;
        PlainToken plain;
        IUniswapV3Pool plainPool;
        bool tokenIsToken0;
    }

    address internal trader = makeAddr("trader");

    // ------------------------------------------------------------- montage

    /// Lance jusqu'à obtenir l'ordre de tokens voulu. Les adresses sont
    /// déterministes, donc la boucle l'est aussi.
    function _launchWithOrdering(bool wantToken0)
        internal
        returns (RevealToken t, IUniswapV3Pool p)
    {
        for (uint256 i = 0; i < 40; i++) {
            (address a, address poolAddr) = launcher.launch("Reveal", "REVEAL", METADATA_URI);
            if ((a < address(weth)) == wantToken0) {
                return (RevealToken(a), IUniswapV3Pool(poolAddr));
            }
        }
        revert("ordre de tokens introuvable");
    }

    function _plainWithOrdering(bool wantToken0) internal returns (PlainToken t) {
        for (uint256 i = 0; i < 40; i++) {
            t = new PlainToken(SUPPLY);
            if ((address(t) < address(weth)) == wantToken0) return t;
        }
        revert("ordre de tokens introuvable");
    }

    /// Monte le pool témoin avec exactement la configuration de référence.
    function _seedPlain(PlainToken t, bool tokenIsToken0)
        internal
        returns (IUniswapV3Pool p)
    {
        (int24 lower, int24 upper) = launcher.ticksFor(tokenIsToken0);
        (address token0, address token1) =
            tokenIsToken0 ? (address(t), address(weth)) : (address(weth), address(t));

        // Même prix de départ, dérivé du même tick par la même bibliothèque.
        p = IUniswapV3Pool(
            manager.createAndInitializePoolIfNecessary(
                token0, token1, FEE, tickMath.sqrtRatioAt(launcher.initialTick(tokenIsToken0))
            )
        );
        p.increaseObservationCardinalityNext(CARDINALITY);

        t.approve(address(manager), SUPPLY);
        (, uint128 liquidity,,) = manager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: FEE,
                tickLower: lower,
                tickUpper: upper,
                amount0Desired: tokenIsToken0 ? SUPPLY : 0,
                amount1Desired: tokenIsToken0 ? 0 : SUPPLY,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp
            })
        );
        assertEq(liquidity, PONS_LIQUIDITY, "le pool temoin n'a pas la liquidite de reference");
    }

    function _pair(bool tokenIsToken0) internal returns (Pair memory pair) {
        (RevealToken t, IUniswapV3Pool p) = _launchWithOrdering(tokenIsToken0);
        PlainToken plain = _plainWithOrdering(tokenIsToken0);
        IUniswapV3Pool plainPool = _seedPlain(plain, tokenIsToken0);

        pair = Pair(t, p, plain, plainPool, tokenIsToken0);

        vm.startPrank(trader);
        t.approve(address(router), type(uint256).max);
        plain.approve(address(router), type(uint256).max);
        weth.approve(address(router), type(uint256).max);
        vm.stopPrank();

        // Les deux pools partent du même endroit, sinon rien de ce qui suit
        // n'a de sens.
        _assertSameState(pair, "au depart");
        // Passé la rampe, aucune règle ne borne plus la taille d'un achat.
        _warp(10 minutes + 1);
    }

    // ---------------------------------------------------------- comparaisons

    function _assertSameState(Pair memory pair, string memory when) internal view {
        (uint160 sqrtA, int24 tickA,,,,,) = pair.revealPool.slot0();
        (uint160 sqrtB, int24 tickB,,,,,) = pair.plainPool.slot0();

        assertEq(sqrtA, sqrtB, string.concat("prix divergent ", when));
        assertEq(tickA, tickB, string.concat("tick divergent ", when));
        assertEq(
            pair.revealPool.liquidity(),
            pair.plainPool.liquidity(),
            string.concat("liquidite active divergente ", when)
        );
        assertEq(
            weth.balanceOf(address(pair.revealPool)),
            weth.balanceOf(address(pair.plainPool)),
            string.concat("reserve de quote divergente ", when)
        );
        assertEq(
            pair.reveal.balanceOf(address(pair.revealPool)),
            pair.plain.balanceOf(address(pair.plainPool)),
            string.concat("reserve de tokens divergente ", when)
        );
    }

    /// Achète le même montant sur les deux pools et compare ce qui en sort.
    function _buyBoth(Pair memory pair, uint256 wethIn, string memory when) internal {
        _giveWeth(trader, wethIn * 2);

        uint256 revealBefore = pair.reveal.balanceOf(trader);
        router.swap(address(pair.revealPool), trader, !pair.tokenIsToken0, int256(wethIn));
        uint256 revealOut = pair.reveal.balanceOf(trader) - revealBefore;

        uint256 plainBefore = pair.plain.balanceOf(trader);
        router.swap(address(pair.plainPool), trader, !pair.tokenIsToken0, int256(wethIn));
        uint256 plainOut = pair.plain.balanceOf(trader) - plainBefore;

        assertEq(revealOut, plainOut, string.concat("sortie en tokens divergente ", when));
        _assertSameState(pair, when);
    }

    /// Vend le même montant sur les deux pools et compare la quote reçue.
    function _sellBoth(Pair memory pair, uint256 amountIn, string memory when) internal {
        uint256 quoteBefore = weth.balanceOf(trader);
        router.swap(address(pair.revealPool), trader, pair.tokenIsToken0, int256(amountIn));
        uint256 revealQuote = weth.balanceOf(trader) - quoteBefore;

        quoteBefore = weth.balanceOf(trader);
        router.swap(address(pair.plainPool), trader, pair.tokenIsToken0, int256(amountIn));
        uint256 plainQuote = weth.balanceOf(trader) - quoteBefore;

        assertEq(revealQuote, plainQuote, string.concat("quote sortie divergente ", when));
        _assertSameState(pair, when);
    }

    // ------------------------------------------------------------ les tests

    function test_ExactInputSizesMatch_TokenIsToken0() public {
        _runSizes(true);
    }

    function test_ExactInputSizesMatch_TokenIsToken1() public {
        _runSizes(false);
    }

    function _runSizes(bool tokenIsToken0) internal {
        Pair memory pair = _pair(tokenIsToken0);
        uint256[5] memory sizes = _sizes();

        for (uint256 i = 0; i < sizes.length; i++) {
            _buyBoth(pair, sizes[i], string.concat("apres l'achat ", vm.toString(i)));
        }

        // Cumul : les cinq tailles dépassent ensemble le seuil de graduation,
        // donc la comparaison couvre bien toute la zone qui compte.
        assertGt(
            weth.balanceOf(address(pair.revealPool)),
            4.2 ether,
            "le cumul n'a pas atteint la zone de graduation"
        );
    }

    function test_AlternatingBuysAndSellsMatch_TokenIsToken0() public {
        _runAlternating(true);
    }

    function test_AlternatingBuysAndSellsMatch_TokenIsToken1() public {
        _runAlternating(false);
    }

    function _runAlternating(bool tokenIsToken0) internal {
        Pair memory pair = _pair(tokenIsToken0);

        // Une première vague d'achats, puis le temps de tout débloquer : au-delà
        // de la fenêtre, le token Reveal ne freine plus rien et les ventes sont
        // comparables une à une.
        _buyBoth(pair, 1 ether, "amorce");
        _warp(1 hours + 1);

        for (uint256 i = 0; i < 4; i++) {
            _buyBoth(pair, 0.25 ether, string.concat("achat alterne ", vm.toString(i)));
            _warp(1 hours + 1);

            uint256 sellable = pair.reveal.releasable(trader) / 4;
            assertGt(sellable, 0, "rien a vendre");
            _sellBoth(pair, sellable, string.concat("vente alternee ", vm.toString(i)));
        }
    }

    /**
     * Un refus reste un refus : quand la règle de déblocage bloque une vente,
     * elle la fait échouer entièrement. Elle n'en exécute pas une version
     * réduite, et ne laisse pas le pool dans un état intermédiaire.
     */
    function test_ARefusedSellLeavesBothPoolsIdentical() public {
        Pair memory pair = _pair(true);
        _buyBoth(pair, 1 ether, "amorce");

        uint256 held = pair.reveal.balanceOf(trader);
        uint256 free = pair.reveal.releasable(trader);
        assertLt(free, held, "tout est deja libere, le test ne prouve rien");

        vm.prank(trader);
        vm.expectRevert();
        pair.reveal.transfer(address(pair.revealPool), held);

        _assertSameState(pair, "apres un refus");
    }
}
