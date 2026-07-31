// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealLocker} from "../src/RevealLocker.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {IUniswapV3Factory, IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";
import {Rules} from "../src/libraries/RevealRules.sol";
import {MockPositionManager} from "./mocks/MockPositionManager.sol";
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
    uint16 internal constant BPS = 10_000;

    /// La liquidité que doit produire un milliard de tokens sur la plage, dans
    /// les deux ordres. Relevée sur les 214 052 positions du launchpad de
    /// référence : toutes portent exactement cette valeur.
    uint128 internal constant PONS_LIQUIDITY = 36_819_258_015_569_838_458_222;

    WETH9 internal weth;
    IUniswapV3Factory internal amm;
    MockPositionManager internal manager;
    ITickMathExposer internal tickMath;
    TestSwapRouter internal router;
    RevealLauncher internal launcher;
    RevealLocker internal locker;
    RevealToken internal token;
    IUniswapV3Pool internal pool;
    /// Mis en cache : les helpers ne doivent contenir aucun appel externe avant
    /// celui qu'un test attend en échec, sinon `expectRevert` vise l'un d'eux.
    bool internal tokenFirst;

    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal whale = makeAddr("whale");
    address internal treasury = makeAddr("treasury");

    function defaultRules() internal pure returns (Rules memory) {
        return Rules({
            initialUnlockBps: 1_000, // 10 %
            unlockSeconds: 1 hours,
            launchDelay: 5,
            buyRamp: 10 minutes
        });
    }

    function setUp() public virtual {
        _setUpEnvironment();

        launcher = new RevealLauncher(
            address(amm),
            address(manager),
            address(weth),
            CARDINALITY,
            SUPPLY,
            treasury,
            defaultRules()
        );
        locker = launcher.locker();

        _launch();
    }

    function _setUpEnvironment() internal virtual {
        // Un timestamp réaliste : l'oracle de v3 travaille sur des uint32.
        vm.warp(1_800_000_000);

        weth = new WETH9();
        router = new TestSwapRouter();
        // v3-core est en 0.7.6 : chargé par artefact, pas par import.
        amm = IUniswapV3Factory(deployCode("UniswapV3Factory.sol:UniswapV3Factory"));
        manager = new MockPositionManager(address(amm), address(weth));
        tickMath = ITickMathExposer(deployCode("TickMathExposer.sol:TickMathExposer"));
    }

    /// Le créateur ne paie que le gas : la liquidité est unilatérale.
    function _launch() internal {
        vm.prank(creator);
        (address t, address p) = launcher.launch("Reveal", "REVEAL", METADATA_URI);
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

    /// Au-delà de `unlockSeconds`, le temps a tout ouvert.
    function _fullyUnlock() internal {
        _warp(1 hours + 1);
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

    function _initialUnlockBps() internal view returns (uint256 v) {
        (v,,,) = token.rules();
    }
}
