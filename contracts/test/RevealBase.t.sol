// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {IUniswapV3Factory, IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";
import {Rules} from "../src/libraries/RevealRules.sol";
import {TestSwapRouter} from "./mocks/TestSwapRouter.sol";
import {WETH9} from "./mocks/WETH9.sol";

interface ITickMathExposer {
    function sqrtRatioAt(int24 tick) external pure returns (uint160);
}

/**
 * Socle commun. Les échanges passent par un routeur de test qui paie en
 * `transferFrom` depuis le compte concerné : c'est exactement la séquence que
 * voit le hook de transfert quand un vrai routeur exécute un ordre.
 */
abstract contract RevealBase is Test {
    uint256 internal constant SUPPLY = 1_000_000_000e18;
    string internal constant METADATA_URI = "ipfs://bafyreiRevealDemoMetadataCid";
    uint24 internal constant FEE = 10_000; // 1 %, tick spacing 200
    uint16 internal constant CARDINALITY = 120;

    /**
     * Plage de la position, exprimée du point de vue « notre token est token0 »,
     * donc en quote par token. Bas : capitalisation de départ ≈ 1,5 ETH sur un
     * milliard de tokens. Haut : environ 11× plus loin, ce qui fait qu'une
     * traversée complète de la plage accumule à peu près 5 ETH — la moyenne
     * géométrique des deux bornes, multipliée par la supply.
     */
    int24 internal constant TICK_LOW = -203_200;
    int24 internal constant TICK_HIGH = -179_000;

    WETH9 internal weth;
    IUniswapV3Factory internal amm;
    ITickMathExposer internal tickMath;
    TestSwapRouter internal router;
    RevealLauncher internal launcher;
    RevealToken internal token;
    IUniswapV3Pool internal pool;
    /// Mis en cache : les helpers ne doivent contenir aucun appel externe avant
    /// celui qu'un test attend en échec, sinon `expectRevert` vise l'un d'eux.
    bool internal tokenFirst;

    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal whale = makeAddr("whale");

    function defaultRules() internal pure returns (Rules memory) {
        return Rules({
            initialUnlockBps: 1_000, // 10 %
            unlockSeconds: 24 hours,
            impactCapBps: 1_000, // 10 % de la réserve de quote
            impactWindow: 5 minutes,
            launchDelay: 30,
            buyRamp: 10 minutes
        });
    }

    function setUp() public virtual {
        _setUpEnvironment();

        launcher = new RevealLauncher(
            address(amm),
            address(weth),
            FEE,
            CARDINALITY,
            _range(TICK_LOW, TICK_HIGH),
            // Quand notre token est token1 le prix s'inverse : la plage est la
            // symétrique par rapport à zéro, bornes échangées.
            _range(-TICK_HIGH, -TICK_LOW)
        );

        _launch(defaultRules());
    }

    function _range(int24 lower, int24 upper)
        internal
        view
        returns (RevealLauncher.Range memory)
    {
        return RevealLauncher.Range({
            tickLower: lower,
            tickUpper: upper,
            sqrtLower: tickMath.sqrtRatioAt(lower),
            sqrtUpper: tickMath.sqrtRatioAt(upper)
        });
    }

    function _setUpEnvironment() internal virtual {
        // Un timestamp réaliste : l'oracle de v3 travaille sur des uint32.
        vm.warp(1_800_000_000);

        weth = new WETH9();
        router = new TestSwapRouter();
        // v3-core est en 0.7.6 : chargé par artefact, pas par import.
        amm = IUniswapV3Factory(
            deployCode("UniswapV3Factory.sol:UniswapV3Factory")
        );
        tickMath = ITickMathExposer(deployCode("TickMathExposer.sol:TickMathExposer"));
    }

    /// Le créateur ne paie que le gas : la liquidité est unilatérale.
    function _launch(Rules memory rules) internal {
        vm.prank(creator);
        (address t, address p) =
            launcher.launch("Reveal", "REVEAL", METADATA_URI, SUPPLY, rules);
        token = RevealToken(t);
        pool = IUniswapV3Pool(p);
        tokenFirst = token.tokenIsToken0();

        for (uint256 i = 0; i < 4; i++) {
            address who = [alice, bob, whale, creator][i];
            vm.startPrank(who);
            token.approve(address(router), type(uint256).max);
            weth.approve(address(router), type(uint256).max);
            vm.stopPrank();
        }
    }

    // -------------------------------------------------------------- échanges

    function _quoteReserve() internal view returns (uint256) {
        return weth.balanceOf(address(pool));
    }

    function _giveWeth(address who, uint256 amount) internal {
        vm.deal(who, amount);
        vm.prank(who);
        weth.deposit{value: amount}();
    }

    /// Achat à montant de quote fixé. Le pool envoie les tokens à `who`, ce que
    /// le hook lit comme une entrée en position.
    function _buy(address who, uint256 wethIn) internal {
        _giveWeth(who, wethIn);
        // zeroForOne vrai quand la quote est token0, c'est-à-dire quand notre
        // token est token1.
        router.swap(address(pool), who, !tokenFirst, int256(wethIn));
    }

    /// Vente : le routeur tire les tokens du vendeur vers le pool — c'est ce
    /// transfert que le protocole intercepte.
    function _sell(address who, uint256 amountIn) internal {
        router.swap(address(pool), who, tokenFirst, int256(amountIn));
    }

    /// Le même transfert, isolé, pour les tests qui attendent un refus.
    function _sellRaw(address who, uint256 amountIn) internal {
        vm.prank(who);
        token.transfer(address(pool), amountIn);
    }

    /// Laisse le token vendable : au-delà de `unlockSeconds`, le temps a tout ouvert.
    function _fullyUnlock() internal {
        _warp(24 hours + 1);
    }

    function _pastRamp() internal {
        _warp(10 minutes + 1);
    }

    /// Avance le temps en gardant les blocs cohérents : l'oracle de v3 n'écrit
    /// une observation qu'une fois par bloc.
    function _warp(uint256 seconds_) internal {
        vm.warp(block.timestamp + seconds_);
        vm.roll(block.number + seconds_ / 2 + 1);
    }
}
