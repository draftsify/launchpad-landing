// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {IUniswapV2Factory} from "../src/interfaces/IUniswapV2.sol";
import {WETH9} from "./mocks/WETH9.sol";

/**
 * Le protocole contre le vrai Uniswap V2 de Robinhood Chain, pas un mock.
 * Ce qu'un mock ne peut pas prouver : que la factory canonique de la chaîne
 * accepte notre paire, que son WETH se comporte comme attendu, et que le hook
 * de transfert tient face au bytecode réellement déployé là-bas.
 *
 *   FORK_ROBINHOOD=1 forge test --match-contract Fork -vv
 *
 * Hors de cette variable le test se saute : la suite doit rester verte sans
 * réseau.
 */
contract RevealForkRobinhoodTest is RevealBase {
    uint256 constant CHAIN_ID = 4663;
    // Adresses vérifiées sur la chaîne : `factory()` du routeur pointe vers
    // cette factory, et `WETH()` vers ce WETH.
    address constant V2_FACTORY = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    bool internal forked;

    function _setUpEnvironment() internal override {
        if (!vm.envOr("FORK_ROBINHOOD", false)) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork("robinhood");
        forked = true;

        amm = IUniswapV2Factory(V2_FACTORY);
        weth = WETH9(payable(WETH));
    }

    function test_LaunchesAgainstTheChainsRealUniswap() public {
        if (!forked) return;

        assertEq(block.chainid, CHAIN_ID, "fork sur la bonne chaine");
        assertGt(V2_FACTORY.code.length, 0, "factory canonique presente");

        (uint256 rToken, uint256 rWeth) = _reserves();
        assertEq(rToken, SUPPLY, "supply entiere dans la paire");
        assertEq(rWeth, LIQUIDITY, "liquidite du createur dans la paire");
        assertEq(amm.getPair(address(token), WETH), address(pair), "paire enregistree");
    }

    /// Le parcours complet sur la chaîne réelle : achat bridé, puis déblocage.
    function test_FullCycleOnTheRealChain() public {
        if (!forked) return;

        _pastRamp();
        _buy(alice, 0.05 ether);
        assertGt(token.balanceOf(alice), 0, "achat execute");

        // 10 % ouvert a l'entree, pas davantage.
        assertApproxEqAbs(token.unlockedBps(alice), 1_000, 5);
        uint256 open = token.releasable(alice);

        vm.expectRevert();
        _sendToPair(alice, open * 3);

        _sell(alice, open);
        assertLt(token.releasable(alice), open / 20, "budget consomme");

        _fullyUnlock();
        assertEq(token.unlockedBps(alice), 10_000, "entierement libere apres la fenetre");
    }
}
