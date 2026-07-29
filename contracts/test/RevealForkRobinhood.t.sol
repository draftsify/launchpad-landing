// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITickMathExposer, RevealBase} from "./RevealBase.t.sol";
import {RevealFees} from "../src/RevealFees.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {IUniswapV3Factory} from "../src/interfaces/IUniswapV3.sol";
import {TestSwapRouter} from "./mocks/TestSwapRouter.sol";
import {WETH9} from "./mocks/WETH9.sol";

/**
 * Le protocole complet contre l'état réel de Robinhood Chain : la factory
 * Uniswap V3 canonique et le WETH de la chaîne, pas des mocks.
 *
 * Ce qu'un test local ne peut pas prouver : que la factory déployée là-bas
 * accepte notre pool, que son WETH se comporte comme attendu, et que la
 * séquence complète — déploiement, lancement, achat, vente refusée, vente
 * autorisée, collecte des frais — tient face au bytecode réellement en place.
 *
 *   FORK_ROBINHOOD=1 forge test --match-contract Fork -vv
 *
 * Sans la variable, le test se saute : la suite doit rester verte sans réseau.
 */
contract RevealForkRobinhoodTest is RevealBase {
    uint256 constant CHAIN_ID = 4663;
    address constant V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant REAL_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    bool internal forked;

    function _setUpEnvironment() internal override {
        if (!vm.envOr("FORK_ROBINHOOD", false)) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork("robinhood");
        forked = true;

        amm = IUniswapV3Factory(V3_FACTORY);
        weth = WETH9(payable(REAL_WETH));
        router = new TestSwapRouter();
        tickMath = ITickMathExposer(deployCode("TickMathExposer.sol:TickMathExposer"));
    }

    function test_TheChainAcceptsOurPool() public {
        if (!forked) return;

        assertEq(block.chainid, CHAIN_ID, "fork sur la bonne chaine");
        assertGt(V3_FACTORY.code.length, 0, "factory canonique presente");
        assertGt(REAL_WETH.code.length, 0, "weth de la chaine present");

        assertEq(
            amm.getPool(address(token), REAL_WETH, FEE),
            address(pool),
            "le pool est enregistre chez la factory de la chaine"
        );
        assertEq(_quoteReserve(), 0, "aucun capital avance");
        assertGt(
            token.balanceOf(address(pool)),
            (SUPPLY * 9_999) / 10_000,
            "toute la supply en liquidite unilaterale"
        );
    }

    /// Le parcours qu'un vrai utilisateur suivra, du premier achat aux frais.
    function test_FullLifecycleOnTheRealChain() public {
        if (!forked) return;

        // 1. Trop tot : la garde anti-sniper refuse.
        _giveWeth(alice, 0.01 ether);
        vm.prank(alice);
        vm.expectRevert(bytes("TF"));
        router.swap(address(pool), alice, !tokenFirst, int256(uint256(0.01 ether)));

        // 2. Passe la rampe, l'achat s'execute et cree la liquidite.
        _pastRamp();
        _buy(alice, 0.05 ether);
        assertGt(token.balanceOf(alice), 0, "achat execute");
        assertEq(_quoteReserve(), 0.05 ether, "l'ETH de l'acheteur est la liquidite");

        // 3. Un dixieme est ouvert, pas davantage.
        assertApproxEqAbs(token.unlockedBps(alice), 1_000, 10, "10 % a l'entree");
        uint256 open = token.releasable(alice);
        vm.expectRevert();
        _sellRaw(alice, open * 3);

        // 4. Ce que la vue annonce s'execute.
        _buy(whale, 1 ether);
        _sell(alice, token.sellableNow(alice));

        // 5. Une heure plus tard, tout est libere.
        _fullyUnlock();
        assertEq(token.unlockedBps(alice), 10_000, "libere apres la fenetre");

        // 6. Les frais du pool arrivent a la tresorerie, la liquidite ne bouge pas.
        uint128 liquidityBefore = pool.liquidity();
        uint256 before = weth.balanceOf(treasury);

        RevealFees fees = launcher.fees();
        fees.collect(address(token));

        assertGt(weth.balanceOf(treasury), before, "la tresorerie a percu des frais");
        assertEq(pool.liquidity(), liquidityBefore, "la liquidite est intacte");
    }

    /// Ce qu un lancement coute reellement, au gas pres.
    function test_LaunchGasCost() public {
        if (!forked) return;

        uint256 before = gasleft();
        vm.prank(creator);
        launcher.launch("Second", "SCND", METADATA_URI);
        uint256 used = before - gasleft();

        emit log_named_uint("gas d un lancement", used);
        emit log_named_uint("metadata (octets)  ", bytes(METADATA_URI).length);
    }

    /// Ce que l interface ecrira reellement : metadonnees entieres dans le contrat.
    function test_MetadataSurvivesOnChain() public {
        if (!forked) return;
        assertEq(token.metadataURI(), METADATA_URI, "lisible sans aucun serveur");
    }
}
