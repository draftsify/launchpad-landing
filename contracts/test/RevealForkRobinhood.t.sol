// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {RevealLauncher} from "../src/RevealLauncher.sol";
import {RevealLocker} from "../src/RevealLocker.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {INonfungiblePositionManager} from "../src/interfaces/INonfungiblePositionManager.sol";
import {IUniswapV3Factory, IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";
import {Rules} from "../src/libraries/RevealRules.sol";
import {TestSwapRouter} from "./mocks/TestSwapRouter.sol";

interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * Le cycle de vie complet contre la vraie chaîne.
 *
 * C'est ce test, et lui seul, qui valide la doublure utilisée partout ailleurs.
 * Les tests locaux montent un `MockPositionManager` parce que v3-periphery ne
 * peut pas être compilé à côté de `src` — versions de Solidity et
 * d'OpenZeppelin incompatibles, et un hash d'init code figé qui ne correspond
 * pas à un pool recompilé localement. Ici, rien n'est simulé : la factory, le
 * WETH et le NonfungiblePositionManager sont ceux que les utilisateurs
 * toucheront.
 *
 * Se saute tout seul si le nœud ne répond pas, plutôt que de rougir pour une
 * raison qui n'a rien à voir avec le protocole.
 */
contract RevealForkRobinhoodTest is Test {
    uint256 constant CHAIN_ID = 4663;
    address constant RH_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant RH_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant RH_POSITION_MANAGER = 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3;

    uint256 constant SUPPLY = 1_000_000_000e18;
    uint128 constant PONS_LIQUIDITY = 36_819_258_015_569_838_458_222;
    uint16 constant CARDINALITY = 120;

    RevealLauncher internal launcher;
    RevealLocker internal locker;
    RevealToken internal token;
    IUniswapV3Pool internal pool;
    TestSwapRouter internal router;
    bool internal forked;
    bool internal tokenFirst;

    address internal creator = makeAddr("creator");
    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        try vm.createSelectFork("robinhood") {
            forked = true;
        } catch {
            return;
        }
        if (block.chainid != CHAIN_ID) {
            forked = false;
            return;
        }

        router = new TestSwapRouter();
        launcher = new RevealLauncher(
            RH_V3_FACTORY,
            RH_POSITION_MANAGER,
            RH_WETH,
            CARDINALITY,
            SUPPLY,
            treasury,
            Rules({
                initialUnlockBps: 1_000,
                unlockSeconds: 15 minutes,
                launchDelay: 5,
                buyRamp: 10 minutes
            })
        );
        locker = launcher.locker();

        vm.prank(creator);
        (address t, address p) = launcher.launch("Reveal", "REVEAL", "ipfs://demo");
        token = RevealToken(t);
        pool = IUniswapV3Pool(p);
        tokenFirst = token.tokenIsToken0();
    }

    modifier onlyForked() {
        if (!forked) {
            emit log("fork indisponible : test saute");
            return;
        }
        _;
    }

    function test_TheRealPositionManagerServesTheRealFactory() public onlyForked {
        assertEq(
            INonfungiblePositionManager(RH_POSITION_MANAGER).factory(),
            RH_V3_FACTORY,
            "le manager ne sert pas la factory attendue"
        );
        assertEq(
            IUniswapV3Factory(RH_V3_FACTORY).feeAmountTickSpacing(10_000),
            200,
            "espacement de ticks inattendu pour le palier 1 %"
        );
    }

    /// La preuve que la doublure locale ne ment pas sur ce qui compte.
    function test_LaunchOnTheRealChainProducesTheReferenceLiquidity() public onlyForked {
        (, uint256 tokenId, uint128 liquidity, int24 lower, int24 upper,,) =
            launcher.launches(address(token));

        assertEq(liquidity, PONS_LIQUIDITY, "liquidite differente de la reference");
        assertEq(liquidity, launcher.expectedLiquidity(tokenFirst), "liquidite non derivee");
        assertGt(tokenId, 0, "aucun NFT frappe");

        if (tokenFirst) {
            assertEq(lower, -204_200, "bord bas");
            assertEq(upper, 887_200, "bord haut");
        } else {
            assertEq(lower, -887_200, "bord bas");
            assertEq(upper, 204_200, "bord haut");
        }

        (, int24 tick,,,,,) = pool.slot0();
        assertEq(tick, launcher.initialTick(tokenFirst), "tick d'ouverture");
    }

    function test_TheRealNftIsHeldByTheLocker() public onlyForked {
        (, uint256 tokenId,,,,,) = launcher.launches(address(token));
        assertEq(
            INonfungiblePositionManager(RH_POSITION_MANAGER).ownerOf(tokenId),
            address(locker),
            "le NFT n'est pas au locker"
        );
        assertEq(locker.positionOwner(address(token)), address(locker), "proprietaire inattendu");
    }

    function test_NoQuoteIsPairedBeforeAnyBuy() public onlyForked {
        assertEq(IWETH(RH_WETH).balanceOf(address(pool)), 0, "de la quote est deja appairee");
        assertEq(locker.graduationProgress(address(token)), 0, "progression non nulle");
    }

    function test_FullLifecycleOnTheRealChain() public onlyForked {
        vm.warp(block.timestamp + 11 minutes);

        // Achat par le vrai pool, payé en vrai WETH.
        vm.deal(buyer, 2 ether);
        vm.startPrank(buyer);
        IWETH(RH_WETH).deposit{value: 2 ether}();
        IWETH(RH_WETH).approve(address(router), type(uint256).max);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();

        router.swap(address(pool), buyer, !tokenFirst, int256(1 ether));

        uint256 held = token.balanceOf(buyer);
        assertGt(held, 0, "l'achat n'a rien rendu");

        // Le déblocage initial, et pas plus : l'achat ne se libère pas lui-même.
        assertApproxEqRel(
            token.releasable(buyer), held / 10, 1e12, "deblocage initial inattendu"
        );

        // La graduation progresse, sans avoir rien migré.
        uint256 progress = locker.graduationProgress(address(token));
        assertGt(progress, 0.97 ether, "progression trop faible");
        assertLt(progress, 1 ether, "progression superieure a ce qui est entre");

        // Une vente au-delà du débloqué est refusée.
        uint256 free = token.releasable(buyer);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(RevealToken.PositionLocked.selector, free)
        );
        token.transfer(address(pool), free + 1);

        // Le temps ouvre tout, et la vente passe.
        vm.warp(block.timestamp + 1 hours + 1);
        router.swap(address(pool), buyer, tokenFirst, int256(token.balanceOf(buyer)));
        assertEq(token.balanceOf(buyer), 0, "la vente n'est pas passee");

        // Les frais rejoignent la trésorerie, la liquidité ne bouge pas.
        uint128 liquidityBefore = locker.liquidityNow(address(token));
        vm.prank(makeAddr("random passer-by"));
        locker.collect(address(token));

        assertEq(
            locker.liquidityNow(address(token)),
            liquidityBefore,
            "la liquidite a bouge pendant la collecte"
        );
        assertGt(IWETH(RH_WETH).balanceOf(treasury), 0, "la tresorerie n'a rien recu");
        assertEq(
            locker.positionOwner(address(token)), address(locker), "le NFT a bouge"
        );
    }
}
