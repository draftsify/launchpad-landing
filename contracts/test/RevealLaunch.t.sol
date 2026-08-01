// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";

/**
 * Ce que le lancement doit avoir produit — et il n'y a pas de « à peu près ».
 *
 * La plage, le prix de départ et la liquidité sont ceux du launchpad dominant
 * de la chaîne, au wei près : c'est ce qui rend les courbes de prix
 * superposables, ce que `RevealCurveParity` vérifie ensuite ordre par ordre.
 */
contract RevealLaunchTest is RevealBase {
    function test_StartsAtExactlyThePonsTick() public view {
        (, int24 tick,,,,,) = pool.slot0();
        assertEq(tick, launcher.initialTick(tokenFirst), "tick d'ouverture inattendu");
        assertTrue(
            tick == -204_200 || tick == 204_200, "le pool n'ouvre pas sur un tick de reference"
        );
    }

    function test_MintsExactlyThePonsLiquidity() public view {
        (, uint256 tokenId, uint128 liquidity,,,,) = launcher.launches(address(token));

        assertEq(liquidity, PONS_LIQUIDITY, "liquidite differente de la reference");
        assertEq(
            liquidity,
            launcher.expectedLiquidity(tokenFirst),
            "liquidite differente de celle derivee"
        );
        assertEq(locker.liquidityNow(address(token)), liquidity, "liquidite non enregistree");
        assertGt(tokenId, 0, "aucun NFT frappe");
    }

    /// La dérivation vaut pour les deux ordres, sans avoir à lancer les deux.
    function test_ExpectedLiquidityMatchesReferenceInBothOrderings() public view {
        assertEq(launcher.expectedLiquidity(true), PONS_LIQUIDITY, "ordre token0");
        assertEq(launcher.expectedLiquidity(false), PONS_LIQUIDITY, "ordre token1");
    }

    function test_NoQuoteIsSpentAndTheSupplyIsDeposited() public view {
        assertEq(_quoteReserve(), 0, "de la quote a ete versee au lancement");
        assertEq(weth.balanceOf(address(launcher)), 0, "le launcher detient de la quote");

        uint256 inPool = token.balanceOf(address(pool));
        assertLe(SUPPLY - inPool, SUPPLY / 1e9, "trop de supply est restee dehors");
        // Le reliquat est la poussière d'arrondi entier, et elle reste au launcher.
        assertEq(token.balanceOf(address(launcher)), SUPPLY - inPool, "reliquat egare");
    }

    function test_PoolHoldsNoQuoteBeforeAnyBuy() public view {
        assertEq(weth.balanceOf(address(pool)), 0, "le pool detient de la quote sans achat");
    }

    function test_TicksAreThePonsRanges() public view {
        (,,, int24 lower, int24 upper,,) = launcher.launches(address(token));

        if (tokenFirst) {
            assertEq(lower, -204_200, "bord bas token0");
            assertEq(upper, 887_200, "bord haut token0");
        } else {
            assertEq(lower, -887_200, "bord bas token1");
            assertEq(upper, 204_200, "bord haut token1");
        }
    }

    function test_TheNftGoesStraightToTheLockerAndNowhereElse() public view {
        assertEq(
            locker.positionOwner(address(token)),
            address(locker),
            "le NFT n'appartient pas au locker"
        );
    }

    function test_LaunchRecordIsStored() public view {
        (
            address p,
            uint256 tokenId,
            uint128 liquidity,
            int24 lower,
            int24 upper,
            address recordedCreator,
            uint64 at
        ) = launcher.launches(address(token));

        assertEq(p, address(pool), "pool non enregistre");
        assertGt(tokenId, 0, "tokenId non enregistre");
        assertEq(liquidity, PONS_LIQUIDITY, "liquidite non enregistree");
        assertEq(recordedCreator, creator, "createur non enregistre");
        assertEq(at, uint64(block.timestamp), "horodatage non enregistre");
        assertTrue(lower < upper, "plage inversee");
    }

    function test_LauncherKeepsNoApprovalAfterLaunch() public view {
        assertEq(
            token.allowance(address(launcher), address(manager)),
            0,
            "une approbation residuelle subsiste"
        );
    }

    // ------------------------------------------------------- refus au constructeur

    function test_RejectsAnAddressWithoutCode() public {
        vm.expectRevert(
            abi.encodeWithSelector(RevealLauncher.NotAContract.selector, address(0xdead))
        );
        new RevealLauncher(
            address(0xdead),
            address(manager),
            address(weth),
            address(tokenFactory),
            CARDINALITY,
            SUPPLY,
            treasury,
            defaultRules()
        );
    }

    function test_RejectsAZeroTreasury() public {
        vm.expectRevert(RevealLauncher.ZeroAddress.selector);
        new RevealLauncher(
            address(amm),
            address(manager),
            address(weth),
            address(tokenFactory),
            CARDINALITY,
            SUPPLY,
            address(0),
            defaultRules()
        );
    }

    function test_RejectsAManagerServingAnotherFactory() public {
        address otherFactory = deployCode("UniswapV3Factory.sol:UniswapV3Factory");
        vm.expectRevert(
            abi.encodeWithSelector(
                RevealLauncher.FactoryMismatch.selector, otherFactory, address(amm)
            )
        );
        new RevealLauncher(
            otherFactory,
            address(manager),
            address(weth),
            address(tokenFactory),
            CARDINALITY,
            SUPPLY,
            treasury,
            defaultRules()
        );
    }

    // ------------------------------------------------------------- métadonnées

    function test_RejectsOversizedStrings() public {
        string memory tooLong = new string(65);
        vm.expectRevert(RevealToken.StringTooLong.selector);
        launcher.launch(tooLong, "REVEAL", METADATA_URI);
    }

    function test_RejectsAnEmptySymbol() public {
        vm.expectRevert(RevealToken.StringTooLong.selector);
        launcher.launch("Reveal", "", METADATA_URI);
    }

    /// Bornée par la constante du contrat, jamais par un chiffre recopié : les
    /// deux finiraient par diverger, et c'est ce test qui doit tenir la borne.
    function test_RejectsOversizedMetadata() public {
        string memory atBound = new string(token.MAX_METADATA_BYTES());
        launcher.launch("Reveal", "REVEAL", atBound);

        string memory tooLong = new string(token.MAX_METADATA_BYTES() + 1);
        vm.expectRevert(RevealToken.StringTooLong.selector);
        launcher.launch("Reveal", "REVEAL", tooLong);
    }

    /**
     * Le nom standard rend le même document que le nôtre — ERC-1046.
     *
     * L'égalité est ce qui compte : deux accesseurs qui divergeraient feraient
     * afficher deux images selon l'outil, et c'est exactement la situation
     * qu'on cherche à éviter en publiant sous un nom que les indexeurs
     * connaissent.
     */
    function test_TokenURIIsTheStandardNameForTheSameDocument() public view {
        assertEq(token.tokenURI(), METADATA_URI, "tokenURI ne rend pas le document");
        assertEq(token.tokenURI(), token.metadataURI(), "les deux accesseurs divergent");
    }

    /// Y compris pour un document réel : la vignette y est un data URI, donc
    /// une chaîne longue que rien ne doit tronquer au passage.
    function test_TokenURICarriesAWholeOnChainDocument() public {
        string memory document =
            'data:application/json;base64,eyJuYW1lIjoiUmV2ZWFsIiwiaW1hZ2UiOiJkYXRhOmltYWdlL3dlYnA7YmFzZTY0LFVrbEdSZz09In0=';
        (address t,) = launcher.launch("Reveal", "REVEAL", document);
        assertEq(RevealToken(t).tokenURI(), document, "document altere");
    }
}
