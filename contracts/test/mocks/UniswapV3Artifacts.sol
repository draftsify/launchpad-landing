// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

// Force la compilation de v3-core, que les tests instancient par `deployCode`.
// Un contrat en 0.7.6 ne peut pas être importé depuis un test en 0.8.24.
import {UniswapV3Factory} from "v3-core/UniswapV3Factory.sol";
