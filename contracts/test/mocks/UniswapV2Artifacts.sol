// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.5.16;

// Ce fichier ne sert qu'à faire compiler v2-core, que les tests instancient
// ensuite par `deployCode`. Foundry ne compile que ce qui est atteignable
// depuis src/ ou test/, et un contrat en 0.5.16 ne peut pas être importé
// depuis un test en 0.8.24.
import {UniswapV2Factory} from "v2-core/UniswapV2Factory.sol";
