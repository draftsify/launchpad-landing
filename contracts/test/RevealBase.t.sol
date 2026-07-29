// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {IUniswapV2Factory, IUniswapV2Pair} from "../src/interfaces/IUniswapV2.sol";
import {Rules} from "../src/libraries/RevealRules.sol";
import {WETH9} from "./mocks/WETH9.sol";

/**
 * Socle commun. Les échanges passent directement par la paire plutôt que par
 * le routeur : c'est exactement la séquence que voit notre hook de transfert,
 * et ça évite de dépendre du hash de bytecode figé dans UniswapV2Library.
 */
abstract contract RevealBase is Test {
    uint256 internal constant SUPPLY = 1_000_000_000e18;
    uint256 internal constant LIQUIDITY = 4 ether;
    string internal constant METADATA_URI = "ipfs://bafyreiRevealDemoMetadataCid";

    WETH9 internal weth;
    IUniswapV2Factory internal amm;
    RevealLauncher internal launcher;
    RevealToken internal token;
    IUniswapV2Pair internal pair;
    /// Mis en cache : les helpers ne doivent contenir aucun appel externe
    /// avant celui qu'un test attend en échec, sinon `expectRevert` vise l'un
    /// d'eux et passe à côté.
    bool internal tokenFirst;

    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal whale = makeAddr("whale");

    function defaultRules() internal pure returns (Rules memory) {
        return Rules({
            initialUnlockBps: 1_000, // 10 %
            unlockSeconds: 24 hours,
            impactCapBps: 100, // 1 % des réserves
            impactWindow: 5 minutes,
            launchDelay: 30,
            buyRamp: 10 minutes
        });
    }

    function setUp() public virtual {
        _setUpEnvironment();
        launcher = new RevealLauncher(address(amm), address(weth), LIQUIDITY);
        _launch(defaultRules());
    }

    /// Surchargé par le test de fork, qui branche le vrai Uniswap d'une chaîne.
    function _setUpEnvironment() internal virtual {
        // Un timestamp réaliste : le TWAP travaille sur des uint32.
        vm.warp(1_800_000_000);

        weth = new WETH9();
        // v2-core est en 0.5.16 : chargé par artefact, pas par import.
        amm = IUniswapV2Factory(
            deployCode("UniswapV2Factory.sol:UniswapV2Factory", abi.encode(address(this)))
        );
    }

    function _launch(Rules memory rules) internal {
        vm.deal(creator, LIQUIDITY);
        vm.prank(creator);
        (address t, address p) =
            launcher.launch{value: LIQUIDITY}("Reveal", "REVEAL", METADATA_URI, SUPPLY, rules);
        token = RevealToken(t);
        pair = IUniswapV2Pair(p);
        tokenFirst = token.tokenIsToken0();
    }

    // ------------------------------------------------------------- échanges

    function _reserves() internal view returns (uint256 rToken, uint256 rWeth) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        return tokenFirst ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
    }

    function _amountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256)
    {
        uint256 inWithFee = amountIn * 997;
        return (inWithFee * reserveOut) / (reserveIn * 1000 + inWithFee);
    }

    function _amountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256)
    {
        return (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1;
    }

    function _quoteBuy(uint256 wethIn) internal view returns (uint256) {
        (uint256 rToken, uint256 rWeth) = _reserves();
        return _amountOut(wethIn, rWeth, rToken);
    }

    /**
     * Les deux moitiés d'un achat sont séparées : `vm.expectRevert` ne vise que
     * l'appel externe suivant, et un test qui attend un refus doit pouvoir
     * pointer le `swap` précisément — c'est lui qui déclenche notre hook.
     */
    function _swapTokensOut(address who, uint256 tokensOut) internal {
        (uint256 a0, uint256 a1) =
            tokenFirst ? (tokensOut, uint256(0)) : (uint256(0), tokensOut);
        pair.swap(a0, a1, who, "");
    }

    function _fundPairWeth(uint256 wethIn) internal {
        vm.deal(address(this), wethIn);
        weth.deposit{value: wethIn}();
        weth.transfer(address(pair), wethIn);
    }

    /// Achat : WETH vers la paire, puis `swap` qui envoie les tokens à `who`.
    function _buy(address who, uint256 wethIn) internal returns (uint256 out) {
        out = _quoteBuy(wethIn);
        _fundPairWeth(wethIn);
        _swapTokensOut(who, out);
    }

    /// Achat à quantité de sortie fixée : indispensable pour tester une borne.
    function _buyExact(address who, uint256 tokensOut) internal {
        (uint256 rToken, uint256 rWeth) = _reserves();
        _fundPairWeth(_amountIn(tokensOut, rWeth, rToken));
        _swapTokensOut(who, tokensOut);
    }

    /// Le transfert vers la paire est ce que le protocole intercepte : isolé
    /// pour que les tests de refus le visent directement.
    function _sendToPair(address who, uint256 amount) internal {
        vm.prank(who);
        token.transfer(address(pair), amount);
    }

    function _sell(address who, uint256 amountIn) internal returns (uint256 out) {
        (uint256 rToken, uint256 rWeth) = _reserves();
        out = _amountOut(amountIn, rToken, rWeth);

        _sendToPair(who, amountIn);

        (uint256 a0, uint256 a1) = tokenFirst ? (uint256(0), out) : (out, uint256(0));
        pair.swap(a0, a1, who, "");
    }

    /// Fait plonger le prix sans passer par une vente, pour tester le relief.
    function _crashPrice(uint256 keepWethBps) internal {
        (, uint256 rWeth) = _reserves();
        deal(address(weth), address(pair), (rWeth * keepWethBps) / 10_000);
        pair.sync();
    }

    /// Laisse le token vendable : au-delà de `unlockSeconds`, le temps a tout ouvert.
    function _fullyUnlock() internal {
        vm.warp(block.timestamp + 24 hours + 1);
    }

    function _pastRamp() internal {
        vm.warp(block.timestamp + 10 minutes + 1);
    }
}
