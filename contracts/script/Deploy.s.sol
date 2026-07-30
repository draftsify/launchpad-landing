// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";
import {Rules} from "../src/libraries/RevealRules.sol";

interface ITickMathExposer {
    function sqrtRatioAt(int24 tick) external pure returns (uint160);
}

/**
 * Déploiement du launcher.
 *
 *   forge script script/Deploy.s.sol:Deploy --rpc-url robinhood_testnet \
 *     --account <keystore> --broadcast
 *
 * Adresses de Robinhood Chain câblées et vérifiées sur la chaîne. Ne pas
 * supposer le prédéploiement OP-stack `0x4200…0006` : c'est une chaîne Arbitrum
 * Orbit et cette adresse n'y porte aucun code.
 *
 * Aucune trésorerie à approvisionner : la liquidité est unilatérale, donc un
 * lancement ne coûte que du gas à son créateur.
 */
contract Deploy is Script, StdCheats {
    uint256 constant ROBINHOOD_MAINNET = 4663;

    address constant RH_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant RH_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    /// 1 % — le palier que le launchpad dominant de cette chaîne utilise aussi.
    uint24 constant FEE = 10_000;
    uint16 constant CARDINALITY = 120;
    uint256 constant SUPPLY = 1_000_000_000e18;

    /**
     * Plage vue depuis « notre token est token0 », donc en quote par token.
     * Bas : capitalisation de départ ≈ 1,5 ETH. Haut : ≈ 11× plus loin, ce qui
     * fait qu'une traversée complète accumule à peu près 5 ETH — la moyenne
     * géométrique des bornes, multipliée par la supply. Multiples de 200, le
     * tick spacing du palier 1 %.
     */
    int24 constant TICK_LOW = -203_200;
    int24 constant TICK_HIGH = -179_000;

    /**
     * Règles du protocole, identiques pour tout lancement. Un dixième vendable
     * dès le premier bloc, tout ouvert au bout d'une heure : de quoi étaler la
     * première vague sans immobiliser qui que ce soit.
     */
    function _rules() private pure returns (Rules memory) {
        return Rules({
            initialUnlockBps: 1_000,
            unlockSeconds: 1 hours,
            impactCapBps: 1_000,
            impactWindow: 5 minutes,
            launchDelay: 5,
            buyRamp: 10 minutes
        });
    }

    error UnknownChain(uint256 chainId);

    function run() external returns (RevealLauncher launcher) {
        address factory = vm.envOr("AMM_FACTORY", address(0));
        address weth = vm.envOr("WETH", address(0));
        // Destinataire des frais de swap. Sans lui, rien ne serait collectable.
        address treasury = vm.envOr("TREASURY", msg.sender);

        bool mainnet = block.chainid == ROBINHOOD_MAINNET;
        if (mainnet) {
            if (factory == address(0)) factory = RH_V3_FACTORY;
            if (weth == address(0)) weth = RH_WETH;
            // En mainnet on ne devine jamais : un WETH faux passerait le
            // déploiement et casserait chaque lancement.
            if (factory == address(0) || weth == address(0)) {
                revert UnknownChain(block.chainid);
            }
        }

        vm.startBroadcast();

        // Ailleurs qu'en mainnet, on pose ce qui manque. Le testnet de
        // Robinhood Chain n'a ni Uniswap ni WETH aux adresses du mainnet :
        // vérifié, ces adresses n'y portent aucun code.
        if (!mainnet && factory == address(0)) {
            factory = deployCode("UniswapV3Factory.sol:UniswapV3Factory");
            console.log("UniswapV3Factory deployed", factory);
        }
        if (!mainnet && weth == address(0)) {
            weth = deployCode("WETH9.sol:WETH9");
            console.log("WETH9 deployed          ", weth);
        }

        // TickMath ne compile pas en 0.8 : la version canonique est déployée
        // puis interrogée, plutôt que retranscrite à la main.
        ITickMathExposer tm =
            ITickMathExposer(deployCode("TickMathExposer.sol:TickMathExposer"));

        launcher = new RevealLauncher(
            factory,
            weth,
            FEE,
            CARDINALITY,
            SUPPLY,
            treasury,
            _rules(),
            _range(tm, TICK_LOW, TICK_HIGH),
            // Quand notre token est token1 le prix s'inverse : plage symétrique,
            // bornes échangées.
            _range(tm, -TICK_HIGH, -TICK_LOW)
        );

        vm.stopBroadcast();

        console.log("chainId       ", block.chainid);
        console.log("RevealLauncher", address(launcher));
        console.log("  v3 factory  ", factory);
        console.log("  weth        ", weth);
        console.log("  fee         ", FEE);
        console.log("  supply      ", SUPPLY);
    }

    function _range(ITickMathExposer tm, int24 lower, int24 upper)
        private
        pure
        returns (RevealLauncher.Range memory)
    {
        return RevealLauncher.Range({
            tickLower: lower,
            tickUpper: upper,
            sqrtLower: tm.sqrtRatioAt(lower),
            sqrtUpper: tm.sqrtRatioAt(upper)
        });
    }
}
