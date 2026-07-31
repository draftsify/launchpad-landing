// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {RevealBase} from "./RevealBase.t.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";
import {TestSwapRouter} from "./mocks/TestSwapRouter.sol";
import {WETH9} from "./mocks/WETH9.sol";

/**
 * Pilote des suites d'actions arbitraires — achats, ventes, transferts, temps
 * qui passe — et vérifie les invariants *au moment* où ils peuvent casser.
 *
 * Deux des règles de la revue ne sont pas des propriétés d'état mais des
 * propriétés de transition : « un achat ajoute son déblocage initial », « un
 * transfert sortant ne recrée jamais de budget ». Elles ne se lisent pas sur un
 * instantané, seulement de part et d'autre d'une action — c'est pourquoi elles
 * sont affirmées ici, dans le handler, et non dans les fonctions `invariant_`.
 */
contract RevealHandler is Test {
    RevealToken public token;
    IUniswapV3Pool public pool;
    TestSwapRouter public router;
    WETH9 public weth;
    bool public tokenFirst;

    address[3] public actors;
    uint256 public buys;
    uint256 public sells;
    uint256 public transfers;
    /// Compte les fois où une règle a refusé une action. Un handler qui échoue
    /// toujours ne prouve rien : ce compteur permet de le vérifier.
    uint256 public refusals;

    constructor(
        RevealToken token_,
        IUniswapV3Pool pool_,
        TestSwapRouter router_,
        WETH9 weth_,
        address[3] memory actors_
    ) {
        token = token_;
        pool = pool_;
        router = router_;
        weth = weth_;
        actors = actors_;
        tokenFirst = token_.tokenIsToken0();
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function buy(uint256 seed, uint256 amount) public {
        address who = _actor(seed);
        amount = bound(amount, 0.0001 ether, 3 ether);

        uint256 releasableBefore = token.releasable(who);
        uint256 heldBefore = token.balanceOf(who);

        vm.deal(who, amount);
        vm.prank(who);
        weth.deposit{value: amount}();

        try router.swap(address(pool), who, !tokenFirst, int256(amount)) {
            buys++;
        } catch {
            refusals++;
            return;
        }

        uint256 acquired = token.balanceOf(who) - heldBefore;
        (uint16 initialUnlockBps,,,) = token.rules();

        // « Aucun achat ne commence avec moins que son déblocage annoncé. »
        assertGe(
            token.releasable(who),
            releasableBefore + (acquired * initialUnlockBps) / 10_000,
            "un achat n'a pas recu son deblocage initial"
        );
    }

    function sell(uint256 seed, uint256 pct) public {
        address who = _actor(seed);
        uint256 free = token.releasable(who);
        if (free == 0) return;

        uint256 amount = (free * bound(pct, 1, 100)) / 100;
        if (amount == 0) return;

        try router.swap(address(pool), who, tokenFirst, int256(amount)) {
            sells++;
        } catch {
            refusals++;
        }
    }

    function transfer(uint256 seed, uint256 toSeed, uint256 pct) public {
        address from = _actor(seed);
        address to = _actor(toSeed);
        if (from == to) return;

        uint256 free = token.releasable(from);
        if (free == 0) return;
        uint256 amount = (free * bound(pct, 1, 100)) / 100;
        if (amount == 0) return;

        vm.prank(from);
        try token.transfer(to, amount) {
            transfers++;
            // « Un transfert sortant ne recrée jamais de budget. »
            assertLe(
                token.releasable(from),
                free,
                "un transfert sortant a recree du budget"
            );
        } catch {
            refusals++;
        }
    }

    function passTime(uint256 seconds_) public {
        seconds_ = bound(seconds_, 1, 2 hours);
        vm.warp(block.timestamp + seconds_);
        vm.roll(block.number + seconds_ / 12 + 1);
    }
}

contract RevealInvariantsTest is RevealBase {
    RevealHandler internal handler;

    function setUp() public override {
        super.setUp();
        _pastRamp();

        handler = new RevealHandler(
            token, pool, router, weth, [alice, bob, whale]
        );

        for (uint256 i = 0; i < 3; i++) {
            address who = [alice, bob, whale][i];
            vm.startPrank(who);
            token.approve(address(router), type(uint256).max);
            weth.approve(address(router), type(uint256).max);
            vm.stopPrank();
        }

        targetContract(address(handler));
    }

    /// Le solde borne toujours ce qui est verrouillé : sans quoi `releasable`
    /// se calculerait sur du vide et une position pourrait se retrouver
    /// définitivement bloquée sous une dette qu'elle ne détient plus.
    function invariant_LockedNeverExceedsBalance() public view {
        address[3] memory who = [alice, bob, whale];
        for (uint256 i = 0; i < who.length; i++) {
            assertLe(
                token.lockedOf(who[i]),
                token.balanceOf(who[i]),
                "la part verrouillee depasse le solde"
            );
        }
    }

    /// La décomposition doit être exacte, pas approximative.
    function invariant_ReleasablePlusLockedEqualsBalance() public view {
        address[3] memory who = [alice, bob, whale];
        for (uint256 i = 0; i < who.length; i++) {
            assertEq(
                token.releasable(who[i]) + token.lockedOf(who[i]),
                token.balanceOf(who[i]),
                "solde mal decompose"
            );
        }
    }

    /// Un solde nul n'a pas de tranche : c'est ce qui permet à un rachat de
    /// repartir propre après une sortie.
    function invariant_ZeroBalanceMeansNoPosition() public view {
        address[3] memory who = [alice, bob, whale];
        for (uint256 i = 0; i < who.length; i++) {
            if (token.balanceOf(who[i]) == 0) {
                (,, uint128 lockedBasis) = token.positions(who[i]);
                assertEq(lockedBasis, 0, "une tranche survit a un solde nul");
            }
        }
    }

    /// La liquidité verrouillée ne bouge pas, quoi qu'il arrive au marché.
    function invariant_LiquidityNeverLeavesTheLocker() public view {
        assertEq(
            locker.liquidityNow(address(token)),
            PONS_LIQUIDITY,
            "la liquidite du pool a bouge"
        );
        assertEq(
            locker.positionOwner(address(token)),
            address(locker),
            "le NFT de position a quitte le locker"
        );
    }

    function invariant_SupplyIsConserved() public view {
        assertEq(token.totalSupply(), SUPPLY, "la supply a bouge");
    }

    /**
     * Un garde-fou sur le test lui-même : si rien ne passait, les invariants
     * seraient vrais pour de mauvaises raisons. `afterInvariant` et non
     * `invariant_` — ces dernières sont évaluées une fois avant le premier
     * appel, quand les compteurs sont forcément à zéro.
     */
    function afterInvariant() public view {
        assertGt(
            handler.buys() + handler.sells() + handler.transfers(),
            0,
            "aucune action n'a abouti : les invariants ne prouvent rien"
        );
    }
}
