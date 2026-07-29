// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";

/// Premier jalon du portage : la liquidite est-elle bien unilaterale ?
contract RevealLaunchTest is RevealBase {
    function test_PoolHoldsWholeSupplyAndNoQuote() public {
        uint256 inPool = token.balanceOf(address(pool));
        emit log_named_decimal_uint("supply    ", SUPPLY, 18);
        emit log_named_decimal_uint("in pool   ", inPool, 18);
        emit log_named_uint("quote in pool (wei)", _quoteReserve());
        emit log_named_uint("dust left in launcher", token.balanceOf(address(launcher)));

        assertEq(_quoteReserve(), 0, "aucune quote : personne n'a avance de capital");
        assertGt(inPool, (SUPPLY * 9_999) / 10_000, "quasi toute la supply dans le pool");
    }

    function test_FirstBuyCreatesTheLiquidity() public {
        _pastRamp();
        _buy(alice, 0.05 ether);

        assertGt(token.balanceOf(alice), 0, "achat execute");
        assertEq(_quoteReserve(), 0.05 ether, "l'ETH de l'acheteur est devenu la liquidite");
    }
}
