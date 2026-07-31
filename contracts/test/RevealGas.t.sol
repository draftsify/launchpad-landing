// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealToken} from "../src/RevealToken.sol";

/**
 * Le coût d'un lancement, mesuré plutôt que supposé.
 *
 * Les métadonnées sont écrites sur la chaîne — image comprise, en data URI —
 * et c'est un choix, pas un accident : rien à épingler sur IPFS, rien à
 * héberger, un token qui s'affiche à partir du seul état de la chaîne. Le prix
 * de ce choix est du stockage, et le stockage se paie au mot.
 *
 * D'où la borne. `MAX_METADATA_BYTES` n'est pas un chiffre rond choisi à
 * l'œil : c'est ce que l'interface produit au pire — une vignette WebP de
 * 8 Ko réencodée en base64, plus la description et les liens — arrondi
 * au-dessus. Ce test dit ce que ce pire cas coûte réellement.
 */
contract RevealGasTest is RevealBase {
    function _string(uint256 size) internal pure returns (string memory out) {
        bytes memory b = new bytes(size);
        for (uint256 i = 0; i < size; i++) b[i] = "a";
        return string(b);
    }

    function test_LaunchGasAtTheMetadataBound() public {
        string memory metadata = _string(token.MAX_METADATA_BYTES());

        uint256 before = gasleft();
        launcher.launch("Reveal", "REVEAL", metadata);
        uint256 used = before - gasleft();

        emit log_named_uint("gas au plafond de metadonnees", used);
        /**
         * Le chiffre paraît énorme et ne l'est pas, sur cette chaîne-ci.
         * Mesuré le 30/07/2026 sur Robinhood Chain : gas à 0,0204 gwei et une
         * limite de bloc de 1,1e15. Les trois cas coûtent donc
         *
         *   sans métadonnées   9 721 989 gas   0,000198 ETH
         *   typique (12 Ko)   18 125 985 gas   0,000369 ETH
         *   plafond (16 Ko)   21 190 262 gas   0,000432 ETH
         *
         * soit moins d'un demi-millième d'ether pour un lancement complet,
         * image comprise. C'est ce qui rend le stockage sur chaîne défendable
         * plutôt que dogmatique : il n'y a rien à épingler, rien à héberger,
         * et le token s'affiche à partir du seul état de la chaîne.
         *
         * La borne existe quand même. Sans elle, la taille des métadonnées est
         * un paramètre libre entre les mains de l'appelant.
         */
        assertLt(used, 25_000_000, "un lancement au plafond coute trop cher");
    }

    function test_LaunchGasWithATypicalMetadata() public {
        // Ce que produit l'interface pour un token avec vignette, description
        // et liens : environ 12 Ko une fois en base64.
        string memory metadata = _string(12_000);

        uint256 before = gasleft();
        launcher.launch("Reveal", "REVEAL", metadata);
        uint256 used = before - gasleft();

        emit log_named_uint("gas pour des metadonnees typiques", used);
    }

    function test_LaunchGasWithoutMetadata() public {
        uint256 before = gasleft();
        launcher.launch("Reveal", "REVEAL", "");
        uint256 used = before - gasleft();

        emit log_named_uint("gas sans metadonnees", used);
    }
}
