// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealLocker} from "../src/RevealLocker.sol";
import {Rules} from "../src/libraries/RevealRules.sol";

/**
 * Déploiement du launcher.
 *
 *   TREASURY=0x… forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url robinhood --account <keystore> --broadcast
 *
 * Adresses de Robinhood Chain câblées et vérifiées sur la chaîne. Ne pas
 * supposer le prédéploiement OP-stack `0x4200…0006` : c'est une chaîne Arbitrum
 * Orbit et cette adresse n'y porte aucun code.
 *
 * Le script ne déploie plus Uniswap lui-même, même hors mainnet. Un lancement
 * dépend du NonfungiblePositionManager canonique, et une copie locale n'a ni le
 * même hash d'init code ni les mêmes pools : la seule façon honnête de répéter
 * un déploiement est de le faire contre un fork de la vraie chaîne. Les tests
 * unitaires, eux, montent leur propre environnement.
 *
 * Aucune trésorerie à approvisionner : la liquidité est unilatérale, donc un
 * lancement ne coûte que du gas à son créateur.
 */
contract Deploy is Script {
    uint256 constant ROBINHOOD_MAINNET = 4663;

    address constant RH_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant RH_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant RH_POSITION_MANAGER = 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3;

    /**
     * Destinataire des frais de swap sur Robinhood Chain.
     *
     * `RevealLocker` prend cette adresse dans son constructeur et n'expose rien
     * pour la changer. Elle est donc versionnée plutôt que tapée en ligne de
     * commande : relue, comparée, et modifiable seulement par un commit.
     *
     * Une adresse a déjà occupé cette ligne — 0x12fedA39… — et en a été retirée
     * parce que sa clé privée avait été collée dans une conversation. Celle-ci a
     * été vérifiée contre l'ensemble des clés ainsi exposées : aucune ne la
     * contrôle. C'est le contrôle à refaire avant toute substitution ici, parce
     * que l'erreur ne se rattrape pas après le déploiement.
     *
     * Vérifiée sur la chaîne : wallet (aucun code), nonce 0, financée.
     */
    address constant RH_TREASURY = 0xa40679bC2f4f5B51Edb05E7A2D573292A3479c62;

    uint16 constant CARDINALITY = 120;
    uint256 constant SUPPLY = 1_000_000_000e18;

    /**
     * Règles du protocole, identiques pour tout lancement. Un dixième vendable
     * dès le premier bloc, tout ouvert au bout d'un quart d'heure : de quoi
     * étaler la première vague sans immobiliser qui que ce soit.
     *
     * La fenêtre a été ramenée d'une heure à quinze minutes. C'est un
     * assouplissement assumé, pas une correction : la contrainte suffit à tenir
     * la thèse — la vente est métrée, jamais interdite — et une heure
     * immobilisait plus longtemps que ce que la découverte de prix demande.
     *
     * La rampe d'achat reste à dix minutes, donc les deux tiers de la fenêtre
     * de déblocage. Ce n'est pas un oubli : elle borne la *taille* des premiers
     * achats, pas la sortie, et c'est elle qui empêche un seul ordre de prendre
     * toute la courbe pendant que la profondeur est nulle.
     *
     * Il n'y a plus de plafond de vente par fenêtre. Voir `RevealToken` : la
     * réserve qu'il prétendait mesurer n'est pas lisible honnêtement depuis un
     * hook ERC-20, et un plafond annoncé à 10 % en laissait passer 17,3 %.
     */
    function _rules() private pure returns (Rules memory) {
        return Rules({
            initialUnlockBps: 1_000,
            unlockSeconds: 15 minutes,
            launchDelay: 5,
            buyRamp: 10 minutes
        });
    }

    error MissingTreasury();
    error NotAContract(string what, address who);
    error WrongMainnetAddress(string what, address expected, address given);

    function run() external returns (RevealLauncher launcher) {
        address factory = vm.envOr("AMM_FACTORY", RH_V3_FACTORY);
        address weth = vm.envOr("WETH", RH_WETH);
        address manager = vm.envOr("POSITION_MANAGER", RH_POSITION_MANAGER);

        /**
         * La trésorerie est explicite, toujours. Elle valait `msg.sender` par
         * défaut hors mainnet — commode en test, et exactement le genre de
         * défaut qui finit en production : les frais d'un protocole entier
         * seraient partis vers la clé de déploiement sans que rien ne le dise.
         */
        address treasury = vm.envOr("TREASURY", address(0));
        if (treasury == address(0)) revert MissingTreasury();

        bool mainnet = block.chainid == ROBINHOOD_MAINNET;
        if (mainnet) {
            // Sur la vraie chaîne, aucune substitution n'est acceptée : ces
            // trois adresses sont celles qui ont été vérifiées, ou rien.
            _mustMatch("AMM_FACTORY", RH_V3_FACTORY, factory);
            _mustMatch("WETH", RH_WETH, weth);
            _mustMatch("POSITION_MANAGER", RH_POSITION_MANAGER, manager);
        }

        // Une adresse sans code est la panne silencieuse par excellence : tous
        // les appels réussiraient en ne faisant rien.
        _mustHaveCode("AMM_FACTORY", factory);
        _mustHaveCode("WETH", weth);
        _mustHaveCode("POSITION_MANAGER", manager);

        vm.startBroadcast();
        launcher =
            new RevealLauncher(factory, manager, weth, CARDINALITY, SUPPLY, treasury, _rules());
        vm.stopBroadcast();

        RevealLocker locker = launcher.locker();

        console.log("chainId        ", block.chainid);
        console.log("RevealLauncher ", address(launcher));
        console.log("RevealLocker   ", address(locker));
        console.log("  treasury     ", locker.treasury());
        console.log("  v3 factory   ", factory);
        console.log("  posn manager ", manager);
        console.log("  weth         ", weth);
        console.log("  supply       ", SUPPLY);
        console.log("  liquidity t0 ", launcher.expectedLiquidity(true));
        console.log("  liquidity t1 ", launcher.expectedLiquidity(false));

        _writeManifest(launcher, locker, factory, manager, weth, treasury);
    }

    function _mustMatch(string memory what, address expected, address given) private pure {
        if (expected != given) revert WrongMainnetAddress(what, expected, given);
    }

    function _mustHaveCode(string memory what, address who) private view {
        if (who.code.length == 0) revert NotAContract(what, who);
    }

    /**
     * Manifeste de déploiement, écrit à côté du dossier `broadcast/` que
     * Foundry produit — celui-ci porte les hashes de transaction, celui-là ce
     * qu'il faut pour rejouer la vérification sans avoir la machine sous la
     * main : paramètres du constructeur et empreintes du code réellement en
     * place. Committé, il rend le déploiement contestable par un tiers.
     */
    function _writeManifest(
        RevealLauncher launcher,
        RevealLocker locker,
        address factory,
        address manager,
        address weth,
        address treasury
    ) private {
        string memory k = "reveal-deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", block.number);
        vm.serializeAddress(k, "launcher", address(launcher));
        vm.serializeAddress(k, "locker", address(locker));
        vm.serializeAddress(k, "treasury", treasury);
        vm.serializeAddress(k, "ammFactory", factory);
        vm.serializeAddress(k, "positionManager", manager);
        vm.serializeAddress(k, "weth", weth);
        vm.serializeUint(k, "supply", SUPPLY);
        vm.serializeUint(k, "observationCardinality", CARDINALITY);
        vm.serializeUint(k, "fee", launcher.FEE());
        vm.serializeInt(k, "tickToken0Lower", launcher.TICK_TOKEN0_LOWER());
        vm.serializeInt(k, "tickToken0Upper", launcher.TICK_TOKEN0_UPPER());
        vm.serializeInt(k, "tickToken1Lower", launcher.TICK_TOKEN1_LOWER());
        vm.serializeInt(k, "tickToken1Upper", launcher.TICK_TOKEN1_UPPER());
        vm.serializeUint(k, "expectedLiquidity", launcher.expectedLiquidity(true));
        vm.serializeUint(k, "graduationQuote", locker.GRADUATION_QUOTE());
        vm.serializeBytes32(k, "launcherCodehash", address(launcher).codehash);
        vm.serializeBytes32(k, "lockerCodehash", address(locker).codehash);

        (uint16 initialUnlockBps, uint32 unlockSeconds, uint32 launchDelay, uint32 buyRamp) =
            launcher.rules();
        vm.serializeUint(k, "initialUnlockBps", initialUnlockBps);
        vm.serializeUint(k, "unlockSeconds", unlockSeconds);
        vm.serializeUint(k, "launchDelay", launchDelay);
        string memory out = vm.serializeUint(k, "buyRamp", buyRamp);

        string memory path = string.concat(
            "deployments/", vm.toString(block.chainid), ".json"
        );
        vm.writeJson(out, path);
        console.log("manifest       ", path);
    }
}
