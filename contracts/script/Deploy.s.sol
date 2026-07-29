// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";

/**
 * Déploiement du launcher.
 *
 *   forge script script/Deploy.s.sol:Deploy --rpc-url robinhood \
 *     --account <keystore> --broadcast
 *
 * Les adresses de Robinhood Chain sont câblées et vérifiées sur la chaîne.
 * Ne pas supposer le prédéploiement OP-stack `0x4200…0006` : Robinhood Chain
 * est sur la pile Arbitrum Orbit et cette adresse n'y porte aucun code.
 *
 * Variables lues :
 *   AMM_FACTORY    factory Uniswap V2. Absente hors Robinhood, le script en pose une.
 *   WETH           WETH de la chaîne. Obligatoire hors Robinhood Chain.
 *   LAUNCH_ETH     liquidité fournie à chaque lancement, en wei.
 *   BUDGET_ETH     dépense maximale de la trésorerie par fenêtre.
 *   BUDGET_WINDOW  longueur de la fenêtre, en secondes.
 *   SEED_ETH       amorçage de la trésorerie. Aller simple : aucun retrait n'existe.
 */
contract Deploy is Script, StdCheats {
    uint256 constant ROBINHOOD_MAINNET = 4663;
    uint256 constant ROBINHOOD_TESTNET = 46630;

    address constant RH_V2_FACTORY = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f;
    address constant RH_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    struct Config {
        address ammFactory;
        address weth;
        uint256 launchLiquidity;
        uint256 budgetPerWindow;
        uint32 budgetWindow;
        uint256 seed;
    }

    error WethUnknown(uint256 chainId);

    function _config() private view returns (Config memory c) {
        bool onRobinhood = block.chainid == ROBINHOOD_MAINNET;

        c.ammFactory = vm.envOr("AMM_FACTORY", onRobinhood ? RH_V2_FACTORY : address(0));
        c.weth = vm.envOr("WETH", onRobinhood ? RH_WETH : address(0));
        c.launchLiquidity = vm.envOr("LAUNCH_ETH", uint256(4 ether));
        // Dix lancements par fenêtre : borne ce qu'un spammeur peut immobiliser.
        c.budgetPerWindow = vm.envOr("BUDGET_ETH", c.launchLiquidity * 10);
        c.budgetWindow = uint32(vm.envOr("BUDGET_WINDOW", uint256(1 days)));
        c.seed = vm.envOr("SEED_ETH", uint256(0));

        // Un WETH faux passerait le déploiement et casserait chaque lancement.
        if (c.weth == address(0)) revert WethUnknown(block.chainid);
    }

    function run() external returns (RevealLauncher launcher) {
        Config memory c = _config();

        vm.startBroadcast();

        if (c.ammFactory == address(0)) {
            // Les testnets n'ont pas toujours Uniswap : on en pose une.
            c.ammFactory =
                deployCode("UniswapV2Factory.sol:UniswapV2Factory", abi.encode(msg.sender));
            console.log("UniswapV2Factory deployed", c.ammFactory);
        }

        launcher = new RevealLauncher(
            c.ammFactory, c.weth, c.launchLiquidity, c.budgetPerWindow, c.budgetWindow
        );

        // Amorcer est un aller simple : la trésorerie ne ressort que vers un pool.
        if (c.seed > 0) {
            (bool ok,) = address(launcher).call{value: c.seed}("");
            require(ok, "seeding failed");
        }

        vm.stopBroadcast();

        _report(launcher, c);
    }

    function _report(RevealLauncher launcher, Config memory c) private view {
        console.log("chainId          ", block.chainid);
        console.log("RevealLauncher   ", address(launcher));
        console.log("  ammFactory     ", c.ammFactory);
        console.log("  weth           ", c.weth);
        console.log("  launchLiquidity", c.launchLiquidity);
        console.log("  budgetPerWindow", c.budgetPerWindow);
        console.log("  budgetWindow   ", c.budgetWindow);
        console.log("  treasury       ", address(launcher).balance);

        if (address(launcher).balance < c.launchLiquidity) {
            console.log("WARNING: tresorerie insuffisante, aucun lancement ne passera");
        }
        if (block.chainid == ROBINHOOD_TESTNET) {
            console.log("note: testnet, verifier AMM_FACTORY avant de compter dessus");
        }
    }
}
