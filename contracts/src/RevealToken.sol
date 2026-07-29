// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";
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
 *
 * ATTENTION, propriété structurante : Uniswap emballe les transferts, donc
 * aucun de nos motifs de revert ne survit au pool. Toute interface doit
 * interroger `sellableNow` avant de signer, jamais lire l'échec après coup.
 */
contract RevealToken is ERC20 {
    using RevealRules for Rules;

    uint16 private constant BPS = 10_000;
    /// Fenêtre du TWAP : le prix de référence ne peut pas être bougé d'un bloc.
    uint32 private constant TWAP_PERIOD = 5 minutes;
    uint256 private constant Q96 = 1 << 96;
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
        /// Tick moyen d'entrée. En ticks et non en prix : l'oracle de v3 rend
        /// un tick, et 1,0001^n n'est pas calculable proprement sur la chaîne.
        int24 basisTick;
        uint128 basisAmount;
        uint128 releasedTotal;
        uint128 soldInWindow;
        uint64 soldAt;
    }

    address public immutable launcher;
    Rules public rules;

    /**
     * Pointeur vers l'image, la description et les liens du token — IPFS en
     * pratique. Écrit une fois, sans setter : c'est ce qui permet à l'interface
     * de tout afficher sans base de données, en ne lisant que la chaîne.
     */
    string public metadataURI;

    address public pool;
    address public quote;
    /**
     * Trésorerie du protocole. Elle reçoit les frais du pool, qui transitent
     * donc par un transfert pool → trésorerie. Ce transfert ressemble à un
     * achat sans en être un : aucune quote n'entre, et le compter comme tel
     * gonflerait faussement la référence du plafond d'impact.
     */
    address public feeTreasury;
    bool public tokenIsToken0;
    uint64 public launchedAt;

    /**
     * Référence du plafond d'impact : la réserve de quote relevée lors du
     * dernier achat, et jamais pendant une vente.
     *
     * Ce détour est imposé par l'ordre des opérations de v3 : le pool envoie le
     * sortant *avant* d'appeler le callback qui nous fait voir l'entrant. Lue
     * en direct pendant une vente, la réserve est déjà amputée du produit de
     * cette vente — la vue et le contrôle liraient deux nombres différents, et
     * une transaction annoncée possible échouerait.
     */
    uint128 public quoteMark;

    mapping(address => Position) public positions;

    event Entry(address indexed holder, uint256 amount, uint64 entryTime, int24 basisTick);
    event Exit(address indexed holder, uint256 amount, uint256 unlockedBps, bool viaPool);

    error OnlyLauncher();
    error AlreadyInitialized();
    error SupplyTooLarge();
    error LaunchDelayActive(uint256 opensAt);
    error BuyTooLarge(uint256 maxBuy);
    error PositionLocked(uint256 releasable);
    error ImpactCapExceeded(uint256 remaining);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        uint256 supply,
        Rules memory rules_
    ) ERC20(name_, symbol_) {
        if (supply > MAX_SUPPLY) revert SupplyTooLarge();
        RevealRules.validate(rules_);
        rules = rules_;
        metadataURI = metadataURI_;
        launcher = msg.sender;
        _mint(msg.sender, supply);
    }

    /**
     * Arme les règles. Jusqu'à cet appel les transferts sont libres, ce qui
     * laisse la factory poser la liquidité ; après, plus rien ne peut être
     * changé — il n'existe aucune autre fonction d'écriture sur la config.
     */
    function initialize(address pool_, address quote_, address feeTreasury_) external {
        if (msg.sender != launcher) revert OnlyLauncher();
        if (pool != address(0)) revert AlreadyInitialized();

        pool = pool_;
        quote = quote_;
        feeTreasury = feeTreasury_;
        tokenIsToken0 = IUniswapV3Pool(pool_).token0() == address(this);
        launchedAt = uint64(block.timestamp);
    }

    // ---------------------------------------------------------------- lecture

    /**
     * Tick moyen sur la fenêtre du TWAP. Retombe sur le tick courant tant que
     * le pool n'a pas d'historique — au tout premier bloc, il n'y a rien à
     * moyenner et le prix n'a pas encore pu être manipulé.
     */
    function twapTick() public view returns (int24 tick, bool fresh) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = TWAP_PERIOD;
        ago[1] = 0;

        try IUniswapV3Pool(pool).observe(ago) returns (
            int56[] memory cumulatives, uint160[] memory
        ) {
            int56 delta = cumulatives[1] - cumulatives[0];
            tick = int24(delta / int56(uint56(TWAP_PERIOD)));
            // La division tronque vers zéro : on arrondit vers le bas comme
            // le fait la bibliothèque d'oracle de v3.
            if (delta < 0 && delta % int56(uint56(TWAP_PERIOD)) != 0) tick--;
            return (tick, true);
        } catch {
            (, int24 spot,,,,,) = IUniswapV3Pool(pool).slot0();
            return (spot, false);
        }
    }

    /**
     * Ticks de perte latente d'une position. Un tick est un pas de 1,0001× ;
     * l'interface convertit en pourcentage, ce qui est trivial hors chaîne et
     * coûteux dessus.
     */
    function drawdownTicks(address holder) public view returns (uint256) {
        Position memory p = positions[holder];
        if (p.basisAmount == 0) return 0;

        // Sans TWAP disponible, aucun relief. Retomber sur le spot ici
        // laisserait quiconque faire plonger le prix d'un bloc pour débloquer
        // sa propre position — la seule manipulation qui serait rentable.
        (int24 now_, bool fresh) = twapTick();
        if (!fresh) return 0;

        // Le sens du prix dépend de l'ordre des tokens dans la paire : si notre
        // token est token0, le prix est « quote par token » et baisser le prix
        // fait baisser le tick. S'il est token1, c'est l'inverse.
        int256 drop = tokenIsToken0
            ? int256(p.basisTick) - int256(now_)
            : int256(now_) - int256(p.basisTick);
        return drop <= 0 ? 0 : uint256(drop);
    }

    /// Part de la position libérée, temps et perte latente confondus.
    function unlockedBps(address holder) public view returns (uint256) {
        Position memory p = positions[holder];
        if (p.basisAmount == 0) return 0;

        uint256 byTime = rules.timeUnlockedBps(block.timestamp - p.entryTime);
        uint256 byRelief = RevealRules.reliefBps(drawdownTicks(holder));
        return byRelief > byTime ? byRelief : byTime;
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

    /**
     * Ce que le plafond d'impact laisse passer vers le pool à cet instant.
     *
     * Le plafond se mesure sur la réserve de quote — c'est l'argent qui subit
     * l'impact. Côté tokens il vaudrait toute la supply au lancement, puisque
     * la liquidité est posée d'un seul côté : « 1 % » n'y freinerait rien.
     * Corollaire voulu : tant que personne n'a acheté, la réserve est nulle et
     * rien ne peut être vendu.
     */
    function windowRemaining(address holder) public view returns (uint256) {
        if (pool == address(0)) return 0;

        uint256 cap = _quoteToTokens((uint256(quoteMark) * rules.impactCapBps) / BPS);

        Position memory p = positions[holder];
        uint256 used =
            RevealRules.decayed(p.soldInWindow, block.timestamp - p.soldAt, rules.impactWindow);
        return used >= cap ? 0 : cap - used;
    }

    /// Ce qu'une vente au pool exécuterait maintenant : le plus contraignant
    /// des deux. C'est cette vue qu'une interface doit lire avant de signer.
    function sellableNow(address holder) external view returns (uint256) {
        uint256 byUnlock = releasable(holder);
        uint256 byWindow = windowRemaining(holder);
        return byUnlock < byWindow ? byUnlock : byWindow;
    }

    // ------------------------------------------------------------- transferts

    function _update(address from, address to, uint256 value) internal override {
        // Émission, destruction, et toute la phase d'amorçage : rien à mesurer.
        if (from == address(0) || to == address(0) || pool == address(0)) {
            super._update(from, to, value);
            return;
        }

        if (from == pool) {
            // Les frais versés à la trésorerie ne sont ni bridés ni comptés
            // comme de la liquidité entrante — mais ils ouvrent bien une
            // position, donc le protocole reste soumis à ses propres règles
            // de vente.
            if (to != feeTreasury) {
                _guardBuy(value);
            // Relève la référence du plafond. Uniquement sur un achat : une
            // vente la ferait baisser au milieu de sa propre vérification.
            // La quote de cet achat n'est pas encore versée — le pool paie
            // après nous — donc on l'estime au prix spot.
                quoteMark = uint128(_quoteReserve() + _tokensToQuote(value));
            }
            _recordEntry(to, value);
        } else if (to == pool) {
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

        // Dénominateur : la supply totale. Ni la réserve du pool — elle vaut
        // toute la supply quand la liquidité est unilatérale — ni la supply en
        // circulation, qui est nulle au lancement et interdirait alors le tout
        // premier achat.
        uint256 maxBuy = (totalSupply() * maxBps) / BPS;
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

        uint256 cap = _quoteToTokens((uint256(quoteMark) * rules.impactCapBps) / BPS);
        uint256 used =
            RevealRules.decayed(p.soldInWindow, block.timestamp - p.soldAt, rules.impactWindow);
        if (used + value > cap) revert ImpactCapExceeded(cap > used ? cap - used : 0);

        p.soldInWindow = uint128(used + value);
        p.soldAt = uint64(block.timestamp);
    }

    /**
     * Entrée en position. Ancienneté et tick d'entrée sont moyennés au prorata :
     * racheter rajeunit la position, ce qui est exactement ce que la règle doit
     * faire.
     */
    function _recordEntry(address to, uint256 value) private {
        Position storage p = positions[to];
        uint256 held = balanceOf(to);

        /**
         * Le prix d'entrée se relève au spot, jamais au TWAP — asymétrie
         * délibérée avec `drawdownTicks`, qui lui exige le TWAP.
         *
         * Le TWAP retarde de plusieurs minutes. Pendant une montée rapide, un
         * acheteur se verrait attribuer un prix très inférieur à celui qu'il a
         * réellement payé, paraîtrait durablement en gain, et n'obtiendrait
         * jamais le relief auquel sa perte réelle lui donne droit.
         *
         * Le spot est sûr ici : v3 met slot0 à jour avant de nous appeler, donc
         * c'est le prix marginal que l'acheteur vient de payer. Le manipuler à
         * la hausse pour se ménager un relief futur suppose d'acheter soi-même
         * à ce prix gonflé — la perte est alors réelle, et le relief mérité.
         */
        (, int24 tick,,,,,) = IUniswapV3Pool(pool).slot0();

        if (held == 0) {
            p.entryTime = uint64(block.timestamp);
            p.basisTick = tick;
            p.basisAmount = uint128(value);
            p.releasedTotal = 0;
        } else {
            uint256 total = held + value;
            p.entryTime =
                uint64((uint256(p.entryTime) * held + block.timestamp * value) / total);
            p.basisTick = int24(
                (int256(p.basisTick) * int256(held) + int256(tick) * int256(value))
                    / int256(total)
            );
            p.basisAmount = uint128(uint256(p.basisAmount) + value);
        }

        emit Entry(to, value, p.entryTime, p.basisTick);
    }

    // ------------------------------------------------------------------ prix

    function _quoteReserve() private view returns (uint256) {
        return ERC20(quote).balanceOf(pool);
    }

    /**
     * Convertit un montant de quote en tokens, au prix spot du pool.
     *
     * Spot et non TWAP, délibérément : manipuler ce prix se retourne contre
     * l'attaquant. Faire baisser le prix pour élargir le plafond suppose de
     * vendre d'abord — ce qui consomme ce même plafond — et rend moins d'ETH
     * sur ce qui passe. Le TWAP reste réservé au drawdown relief, où la
     * manipulation, elle, serait profitable.
     */
    /// Miroir de `_quoteToTokens`, utilisé pour estimer la quote d'un achat
    /// avant que le pool ne la verse.
    function _tokensToQuote(uint256 tokenAmount) private view returns (uint256) {
        if (tokenAmount == 0) return 0;
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
        if (sqrtPriceX96 == 0) return 0;

        if (tokenIsToken0) {
            uint256 step = Math.mulDiv(tokenAmount, sqrtPriceX96, Q96);
            return Math.mulDiv(step, sqrtPriceX96, Q96);
        }
        uint256 half = Math.mulDiv(tokenAmount, Q96, sqrtPriceX96);
        return Math.mulDiv(half, Q96, sqrtPriceX96);
    }

    function _quoteToTokens(uint256 quoteAmount) private view returns (uint256) {
        if (quoteAmount == 0) return 0;
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
        if (sqrtPriceX96 == 0) return 0;

        // Le carré du sqrt déborde un uint256 : on multiplie en deux temps.
        if (tokenIsToken0) {
            // prix = quote par token → tokens = quote / prix.
            uint256 half = Math.mulDiv(quoteAmount, Q96, sqrtPriceX96);
            return Math.mulDiv(half, Q96, sqrtPriceX96);
        }
        // prix = tokens par quote → tokens = quote × prix.
        uint256 step = Math.mulDiv(quoteAmount, sqrtPriceX96, Q96);
        return Math.mulDiv(step, sqrtPriceX96, Q96);
    }
}
