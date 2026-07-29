// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";

/**
 * Déploiement du launcher.
 *
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
 *
 * Variables lues :
 *   AMM_FACTORY  factory Uniswap V2 de la chaîne. Non renseignée, le script en
 *                déploie une : les testnets n'en ont pas toujours.
 *   WETH         par défaut le prédéploiement OP-stack, valable sur Base.
 *   LAUNCH_ETH   liquidité imposée à chaque lancement, en wei.
 */
contract Deploy is Script, StdCheats {
    address constant OP_STACK_WETH = 0x4200000000000000000000000000000000000006;

    function run() external returns (RevealLauncher launcher) {
        address ammFactory = vm.envOr("AMM_FACTORY", address(0));
        address weth = vm.envOr("WETH", OP_STACK_WETH);
        uint256 launchLiquidity = vm.envOr("LAUNCH_ETH", uint256(4 ether));

        vm.startBroadcast();

        if (ammFactory == address(0)) {
            ammFactory = deployCode(
                "UniswapV2Factory.sol:UniswapV2Factory", abi.encode(msg.sender)
            );
            console.log("UniswapV2Factory deployed", ammFactory);
        }

        launcher = new RevealLauncher(ammFactory, weth, launchLiquidity);

        vm.stopBroadcast();

        console.log("RevealLauncher   ", address(launcher));
        console.log("  ammFactory     ", ammFactory);
        console.log("  weth           ", weth);
        console.log("  launchLiquidity", launchLiquidity);
    }
}
