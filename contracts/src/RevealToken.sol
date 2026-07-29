// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IUniswapV2Pair} from "./interfaces/IUniswapV2.sol";
import {Rules, RevealRules} from "./libraries/RevealRules.sol";

/**
 * Token d'un lancement Reveal.
 *
 * La thèse du protocole est la découverte de prix, pas l'interdiction de
 * vendre : chaque position se libère avec le temps, plus vite si elle est en
 * perte, et chaque vente est plafonnée par fenêtre pour que le prix ait le
 * temps de se former. Tout est écrit ici, dans le hook de transfert — il n'y a
 * ni administrateur, ni pause, ni liste blanche.
 *
 * Trois portes, dans cet ordre :
 *   1. anti-sniper  — sur les achats, pendant les premières minutes ;
 *   2. déblocage    — sur les sorties, contre l'ancienneté et la perte latente ;
 *   3. plafond      — sur les ventes au pool, par fenêtre glissante.
 */
contract RevealToken is ERC20 {
    using RevealRules for Rules;

    uint16 private constant BPS = 10_000;
    /// Fenêtre du TWAP : le prix de référence ne peut pas être bougé d'un bloc.
    uint32 private constant TWAP_PERIOD = 5 minutes;
    /**
     * Plafond de supply. Vérifié ici et non seulement dans le launcher : c'est
     * lui qui rend sûrs les `uint128` de `Position`, et un token déployé
     * directement doit avoir la même garantie.
     */
    uint256 public constant MAX_SUPPLY = 1e36;

    /// État d'un détenteur. `basisAmount` est la référence du déblocage : ce
    /// que la position a reçu, et non ce qu'elle détient encore — sinon vendre
    /// réduirait la base et rouvrirait aussitôt le même pourcentage.
    struct Position {
        uint64 entryTime;
        uint224 basisPriceX112;
        uint128 basisAmount;
        uint128 releasedTotal;
        uint128 soldInWindow;
        uint64 soldAt;
    }

    address public immutable launcher;
    Rules public rules;

    address public pair;
    bool public tokenIsToken0;
    uint64 public launchedAt;

    /// Oracle TWAP alimenté par les cumuls du pool.
    uint256 public priceCumulativeLast;
    uint32 public priceObservedAt;
    uint224 public priceAverageX112;

    mapping(address => Position) public positions;

    event Entry(
        address indexed holder, uint256 amount, uint64 entryTime, uint224 basisPriceX112
    );
    event Exit(address indexed holder, uint256 amount, uint256 unlockedBps, bool viaPool);

    error OnlyLauncher();
    error AlreadyInitialized();
    error SupplyTooLarge();
    error LaunchDelayActive(uint256 opensAt);
    error BuyTooLarge(uint256 maxBuy);
    error PositionLocked(uint256 releasable);
    error ImpactCapExceeded(uint256 remaining);

    constructor(string memory name_, string memory symbol_, uint256 supply, Rules memory rules_)
        ERC20(name_, symbol_)
    {
        if (supply > MAX_SUPPLY) revert SupplyTooLarge();
        RevealRules.validate(rules_);
        rules = rules_;
        launcher = msg.sender;
        _mint(msg.sender, supply);
    }

    /**
     * Arme les règles. Jusqu'à cet appel les transferts sont libres, ce qui
     * laisse la factory déposer la liquidité ; après, plus rien ne peut être
     * changé — il n'existe aucune autre fonction d'écriture sur la config.
     */
    function initialize(address pair_) external {
        if (msg.sender != launcher) revert OnlyLauncher();
        if (pair != address(0)) revert AlreadyInitialized();

        pair = pair_;
        tokenIsToken0 = IUniswapV2Pair(pair_).token0() == address(this);
        launchedAt = uint64(block.timestamp);

        (uint112 r0, uint112 r1,) = IUniswapV2Pair(pair_).getReserves();
        priceAverageX112 = uint224(tokenIsToken0 ? _uq(r1, r0) : _uq(r0, r1));
        priceCumulativeLast = _cumulative();
        priceObservedAt = uint32(block.timestamp);
    }

    // ---------------------------------------------------------------- lecture

    /// Part de la position libérée, temps et perte latente confondus.
    function unlockedBps(address holder) public view returns (uint256) {
        Position memory p = positions[holder];
        if (p.basisAmount == 0) return 0;

        uint256 byTime = rules.timeUnlockedBps(block.timestamp - p.entryTime);
        uint256 byRelief = RevealRules.reliefBps(drawdownBps(holder));
        return byRelief > byTime ? byRelief : byTime;
    }

    /// Perte latente de la position, en bps, mesurée contre le TWAP.
    function drawdownBps(address holder) public view returns (uint256) {
        uint256 basis = positions[holder].basisPriceX112;
        uint256 current = priceAverageX112;
        if (basis == 0 || current >= basis) return 0;
        return ((basis - current) * BPS) / basis;
    }

    /// Ce que la position peut encore laisser sortir, tous canaux confondus.
    function releasable(address holder) public view returns (uint256) {
        Position memory p = positions[holder];
        uint256 budget = (uint256(p.basisAmount) * unlockedBps(holder)) / BPS;
        if (budget <= p.releasedTotal) return 0;

        uint256 remaining = budget - p.releasedTotal;
        uint256 balance = balanceOf(holder);
        return remaining > balance ? balance : remaining;
    }

    /// Ce que le plafond d'impact laisse passer vers le pool à cet instant.
    function windowRemaining(address holder) public view returns (uint256) {
        if (pair == address(0)) return 0;
        Position memory p = positions[holder];

        uint256 cap = (_tokenReserve() * rules.impactCapBps) / BPS;
        uint256 used =
            RevealRules.decayed(p.soldInWindow, block.timestamp - p.soldAt, rules.impactWindow);
        return used >= cap ? 0 : cap - used;
    }

    /// Avance le TWAP sans transfert : l'interface en a besoin pour afficher
    /// une perte latente à jour sur une position qui ne bouge pas.
    function syncOracle() external {
        if (pair != address(0)) _syncOracle();
    }

    /// Ce qu'une vente au pool exécuterait maintenant : le plus contraignant des deux.
    function sellableNow(address holder) external view returns (uint256) {
        uint256 byUnlock = releasable(holder);
        uint256 byWindow = windowRemaining(holder);
        return byUnlock < byWindow ? byUnlock : byWindow;
    }

    // ------------------------------------------------------------- transferts

    function _update(address from, address to, uint256 value) internal override {
        // Émission, destruction, et toute la phase d'amorçage : rien à mesurer.
        if (from == address(0) || to == address(0) || pair == address(0)) {
            super._update(from, to, value);
            return;
        }

        _syncOracle();

        if (from == pair) {
            _guardBuy(value);
            _recordEntry(to, value);
        } else if (to == pair) {
            uint256 unlocked = _consumeRelease(from, value);
            _consumeWindow(from, value);
            emit Exit(from, value, unlocked, true);
        } else {
            // Un transfert simple consomme le déblocage comme une vente : sans
            // cela, éclater sa position entre dix adresses la contournerait.
            uint256 unlocked = _consumeRelease(from, value);
            _recordEntry(to, value);
            emit Exit(from, value, unlocked, false);
        }

        super._update(from, to, value);
    }

    function _guardBuy(uint256 value) private view {
        uint256 sinceLaunch = block.timestamp - launchedAt;
        if (sinceLaunch < rules.launchDelay) {
            revert LaunchDelayActive(launchedAt + rules.launchDelay);
        }

        uint256 maxBps = rules.rampBps(sinceLaunch);
        if (maxBps >= BPS) return;

        uint256 maxBuy = (_tokenReserve() * maxBps) / BPS;
        if (value > maxBuy) revert BuyTooLarge(maxBuy);
    }

    function _consumeRelease(address from, uint256 value) private returns (uint256 unlocked) {
        Position storage p = positions[from];
        unlocked = unlockedBps(from);

        uint256 budget = (uint256(p.basisAmount) * unlocked) / BPS;
        uint256 used = p.releasedTotal;
        if (used + value > budget) revert PositionLocked(budget > used ? budget - used : 0);

        p.releasedTotal = uint128(used + value);
    }

    function _consumeWindow(address from, uint256 value) private {
        Position storage p = positions[from];

        uint256 cap = (_tokenReserve() * rules.impactCapBps) / BPS;
        uint256 used =
            RevealRules.decayed(p.soldInWindow, block.timestamp - p.soldAt, rules.impactWindow);
        if (used + value > cap) revert ImpactCapExceeded(cap > used ? cap - used : 0);

        p.soldInWindow = uint128(used + value);
        p.soldAt = uint64(block.timestamp);
    }

    /**
     * Entrée en position. Ancienneté et prix de revient sont moyennés au
     * prorata : racheter rajeunit la position, ce qui est exactement ce que la
     * règle doit faire.
     */
    function _recordEntry(address to, uint256 value) private {
        Position storage p = positions[to];
        uint256 held = balanceOf(to);
        uint224 price = priceAverageX112;

        if (held == 0) {
            p.entryTime = uint64(block.timestamp);
            p.basisPriceX112 = price;
            p.basisAmount = uint128(value);
            p.releasedTotal = 0;
        } else {
            uint256 total = held + value;
            p.entryTime =
                uint64((uint256(p.entryTime) * held + block.timestamp * value) / total);
            p.basisPriceX112 =
                uint224((uint256(p.basisPriceX112) * held + uint256(price) * value) / total);
            p.basisAmount = uint128(uint256(p.basisAmount) + value);
        }

        emit Entry(to, value, p.entryTime, p.basisPriceX112);
    }

    // ----------------------------------------------------------------- oracle

    /**
     * Avance le TWAP. Le prix de référence n'est jamais le spot : le faire
     * plonger le temps d'un bloc pour déclencher le drawdown relief coûterait
     * de tenir le prix bas pendant toute la fenêtre.
     */
    function _syncOracle() private {
        (uint112 r0, uint112 r1, uint32 pairAt) = IUniswapV2Pair(pair).getReserves();
        if (r0 == 0 || r1 == 0) return;

        uint256 cumulative = _cumulative();

        unchecked {
            // Les horodatages du pool bouclent sur 32 bits : même arithmétique.
            uint32 nowTs = uint32(block.timestamp);
            uint32 sincePair = nowTs - pairAt;
            if (sincePair != 0) {
                // v2 n'accumule qu'au premier échange d'un bloc : on complète.
                uint256 spot = tokenIsToken0 ? _uq(r1, r0) : _uq(r0, r1);
                cumulative += spot * sincePair;
            }

            uint32 elapsed = nowTs - priceObservedAt;
            if (elapsed >= TWAP_PERIOD) {
                priceAverageX112 = uint224((cumulative - priceCumulativeLast) / elapsed);
                priceCumulativeLast = cumulative;
                priceObservedAt = nowTs;
            }
        }
    }

    function _cumulative() private view returns (uint256) {
        return tokenIsToken0
            ? IUniswapV2Pair(pair).price0CumulativeLast()
            : IUniswapV2Pair(pair).price1CumulativeLast();
    }

    function _tokenReserve() private view returns (uint256) {
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(pair).getReserves();
        return tokenIsToken0 ? r0 : r1;
    }

    /// Prix en UQ112x112, la représentation qu'utilisent les cumuls du pool.
    function _uq(uint112 numerator, uint112 denominator) private pure returns (uint256) {
        return (uint256(numerator) << 112) / denominator;
    }
}
