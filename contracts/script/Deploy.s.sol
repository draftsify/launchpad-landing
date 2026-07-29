// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";

/**
 * Déploiement du launcher.
 *
 *   forge script script/Deploy.s.sol:Deploy --rpc-url robinhood --broadcast
 *
 * Les adresses de Robinhood Chain sont câblées et vérifiées sur la chaîne :
 * factory Uniswap V2 canonique et WETH. Ne pas supposer le prédéploiement
 * OP-stack `0x4200…0006` — Robinhood Chain est sur la pile Arbitrum Orbit et
 * cette adresse n'y porte aucun code.
 *
 * Variables lues, pour toute autre chaîne :
 *   AMM_FACTORY  factory Uniswap V2. Absente, le script en déploie une.
 *   WETH         WETH de la chaîne. Obligatoire hors Robinhood Chain.
 *   LAUNCH_ETH   liquidité imposée à chaque lancement, en wei.
 */
contract Deploy is Script, StdCheats {
    uint256 constant ROBINHOOD_MAINNET = 4663;
    uint256 constant ROBINHOOD_TESTNET = 46630;

    address constant RH_V2_FACTORY = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f;
    address constant RH_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    error WethUnknown(uint256 chainId);

    function run() external returns (RevealLauncher launcher) {
        bool onRobinhoodMainnet = block.chainid == ROBINHOOD_MAINNET;

        address ammFactory =
            vm.envOr("AMM_FACTORY", onRobinhoodMainnet ? RH_V2_FACTORY : address(0));
        address weth = vm.envOr("WETH", onRobinhoodMainnet ? RH_WETH : address(0));
        uint256 launchLiquidity = vm.envOr("LAUNCH_ETH", uint256(4 ether));

        // Un WETH faux passerait le déploiement et casserait chaque lancement.
        if (weth == address(0)) revert WethUnknown(block.chainid);

        vm.startBroadcast();

        if (ammFactory == address(0)) {
            // Les testnets n'ont pas toujours Uniswap : on en pose une.
            ammFactory =
                deployCode("UniswapV2Factory.sol:UniswapV2Factory", abi.encode(msg.sender));
            console.log("UniswapV2Factory deployed", ammFactory);
        }

        launcher = new RevealLauncher(ammFactory, weth, launchLiquidity);

        vm.stopBroadcast();

        console.log("chainId          ", block.chainid);
        console.log("RevealLauncher   ", address(launcher));
        console.log("  ammFactory     ", ammFactory);
        console.log("  weth           ", weth);
        console.log("  launchLiquidity", launchLiquidity);

        if (block.chainid == ROBINHOOD_TESTNET) {
            console.log("note: testnet, verifier AMM_FACTORY avant de compter dessus");
        }
    }
}
