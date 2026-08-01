// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";
import {Rules, RevealRules} from "./libraries/RevealRules.sol";
import {LaunchMeta, Socials, TokenInfo} from "./RevealTypes.sol";

/**
 * Token d'un lancement Reveal.
 *
 * La thèse du protocole est la découverte de prix, pas l'interdiction de
 * vendre : chaque acquisition se libère avec le temps, plus vite si elle est en
 * perte. Tout est écrit ici, dans le hook de transfert — il n'y a ni
 * administrateur, ni pause, ni liste blanche.
 *
 * Deux portes, dans cet ordre :
 *   1. anti-sniper  — sur les achats, pendant les premières minutes ;
 *   2. déblocage    — sur toute sortie, contre l'ancienneté et la perte latente.
 *
 * Il y en avait une troisième, un plafond de vente par fenêtre exprimé en
 * pourcentage de la réserve de quote. Elle a été retirée. La raison tient à
 * l'ordre des opérations de Uniswap V3 : le pool envoie le sortant *avant*
 * d'appeler le hook qui nous ferait voir l'entrant. Sur une vente, la réserve
 * est donc déjà amputée quand on la lit ; sur un achat, la quote n'est pas
 * encore arrivée et devait être estimée au prix marginal d'arrivée — alors que
 * l'achat s'est payé au prix moyen du trajet. Au bord d'une position
 * unilatérale l'écart approche un facteur deux : un plafond annoncé à 10 %
 * laissait passer 17,3 % de la réserve réelle. Un chiffre exact ne peut pas
 * être déduit honnêtement depuis ce hook, donc il n'est plus annoncé.
 *
 * ATTENTION, propriété structurante : Uniswap emballe les transferts, donc
 * aucun de nos motifs de revert ne survit au pool. Toute interface doit
 * interroger `releasable` avant de signer, jamais lire l'échec après coup.
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

    /// Bornes des chaînes. Sans elles, un lancement peut coûter un gas
    /// arbitraire et rendre le token illisible pour tout indexeur.
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_SYMBOL_BYTES = 16;
    uint256 public constant MAX_METADATA_BYTES = 16_384;
    /**
     * Bornes des champs lisibles séparément.
     *
     * Elles existent parce que ces chaînes sont rendues telles quelles par des
     * outils tiers, et qu'un `logo` de quatre kilo-octets serait un moyen commode
     * de faire tomber un indexeur en écrivant un token. 256 tient un `ipfs://`
     * plus large que tout CID existant.
     */
    uint256 public constant MAX_LINK_BYTES = 256;
    uint256 public constant MAX_DESCRIPTION_BYTES = 1_024;

    /**
     * Ce que le créateur peut acheter dans la transaction de lancement, en bps
     * de la supply. Cinq pour cent.
     *
     * Il faut dire exactement ce que ce chiffre concède, parce que c'est un
     * privilège, et qu'un privilège tu par l'interface devient un piège pour
     * qui ne le connaît pas : le créateur achète **avant tout le monde**, au
     * prix d'ouverture, sans subir le délai anti-sniper. C'est un avantage réel
     * et il est inscrit dans le code plutôt que vendu comme une neutralité.
     *
     * Ce qu'il ne concède pas, et c'est l'essentiel : rien sur la sortie. Les
     * tokens ainsi achetés ouvrent une position ordinaire, avec le même
     * déblocage initial et le même calendrier que ceux de n'importe quel
     * acheteur. Le créateur ne peut pas vendre plus tôt, seulement acheter plus
     * tôt.
     *
     * Le plafond est cumulé sur la fenêtre, et non par transaction : sans cela
     * il suffirait de plusieurs transactions dans le même bloc pour le
     * contourner entièrement.
     *
     * Repris de `RevealRules` plutôt que réécrit : le launcher l'annonce avant
     * qu'un token existe, et un plafond qui diverge de celui qu'on affiche est
     * pire que pas de plafond du tout.
     */
    uint16 public constant CREATOR_BUY_MAX_BPS = RevealRules.CREATOR_BUY_MAX_BPS;

    /**
     * Part verrouillée d'un détenteur, sous forme d'une tranche unique.
     *
     * `lockedBasis` n'est pas ce que la position détient ni ce qu'elle a reçu :
     * c'est la taille dont `BPS - unlockedBps` donne la part encore bloquée. La
     * quantité libre se déduit — `solde - verrouillé` — au lieu d'être comptée à
     * part. C'est ce qui règle le défaut de l'ancienne comptabilité, où une
     * dette de déblocage (`releasedTotal`) survivait à une sortie et pouvait
     * annuler le déblocage initial d'un rachat.
     *
     * Une seule tranche, jamais un tableau : la fusion (voir `_recordBuy`)
     * conserve exactement la quantité déjà libre et repart de zéro sur le reste.
     */
    struct Position {
        uint64 lockStart;
        /// Tick moyen d'acquisition de la part encore verrouillée. En ticks et
        /// non en prix : l'oracle de v3 rend un tick, et 1,0001^n n'est pas
        /// calculable proprement sur la chaîne.
        int24 lockTick;
        uint128 lockedBasis;
    }

    address public immutable launcher;
    Rules public rules;

    /**
     * Pointeur vers l'image, la description et les liens du token. Écrit une
     * fois, sans setter : c'est ce qui permet à l'interface de tout afficher
     * sans base de données, en ne lisant que la chaîne.
     */
    string public metadataURI;

    /**
     * Le même document, sous le nom que le reste du monde interroge — ERC-1046.
     *
     * Pourquoi ce doublon. `metadataURI` est un nom que nous avons inventé :
     * aucun indexeur, aucun portefeuille, aucun explorateur ne va l'appeler,
     * parce que rien ne leur dit qu'il existe. Mesuré sur les terminaux où ces
     * lancements circulent, l'image reste une pastille grise alors qu'elle est
     * écrite dans le contrat, à quelques octets de là.
     *
     * ERC-1046 définit `tokenURI()` sur un ERC-20 comme le pointeur vers un
     * document JSON portant `name`, `symbol`, `decimals`, `description` et
     * `image`. C'est exactement ce que nous écrivons déjà. Exposer le même
     * contenu sous le nom standard ne coûte rien à l'exécution — la fonction ne
     * fait que relire le même emplacement — et rend le logo trouvable par qui
     * suit la norme plutôt que par qui nous connaît.
     *
     * Ce qu'elle rend est un data URI, pas une adresse HTTP, et c'est délibéré :
     * une URL grave un nom de domaine dans un contrat immuable, donc parie que
     * ce domaine vivra aussi longtemps que la chaîne. Le document se lit ici
     * sans dépendre de personne.
     */
    function tokenURI() external view returns (string memory) {
        return metadataURI;
    }

    /**
     * Les mêmes informations, sous les noms que cette chaîne interroge.
     *
     * `logo` porte un `ipfs://<cid>` — pas un data URI, pas une URL HTTP. C'est
     * ce que rendent les onze autres tokens de cette chaîne qui exposent ce
     * champ, et un indexeur qui sait résoudre l'un saura résoudre l'autre.
     *
     * Écrits une fois dans le constructeur, sans setter, comme tout le reste
     * ici : ce qui n'est pas mis au lancement ne le sera jamais.
     */
    string public logo;
    string public description;
    Socials private _socials;

    function socials() external view returns (Socials memory) {
        return _socials;
    }

    function getTokenInfo() external view returns (TokenInfo memory) {
        return TokenInfo(creator, logo, description, _socials);
    }

    /// Le nom qu'emploie le reste de la chaîne pour ce que nous appelons
    /// `creator`. Même adresse, deux vocabulaires.
    function deployer() external view returns (address) {
        return creator;
    }

    address public pool;
    address public quote;
    /**
     * Créateur du lancement, et seul bénéficiaire de la fenêtre d'achat
     * initiale. Écrit une fois par le launcher, sans setter : il ne peut pas
     * être transféré à une autre adresse après coup.
     */
    address public creator;
    /// Ce que le créateur a déjà acheté dans la fenêtre. Cumulé, donc plafonné.
    uint256 public creatorBought;
    /**
     * Trésorerie du protocole. Elle reçoit les frais du pool, qui transitent
     * donc par un transfert pool → trésorerie. Ce transfert ressemble à un
     * achat sans en être un : il ne doit pas être soumis à la rampe anti-sniper,
     * sans quoi la collecte échouerait pendant les premières minutes. Il ouvre
     * en revanche bien une position — le protocole reste soumis à ses propres
     * règles de sortie.
     */
    address public feeTreasury;
    bool public tokenIsToken0;
    uint64 public launchedAt;

    mapping(address => Position) public positions;

    event Entry(address indexed holder, uint256 amount, uint64 lockStart, int24 lockTick);
    event Exit(address indexed holder, uint256 amount, uint256 unlockedBps, bool viaPool);

    error OnlyLauncher();
    error AlreadyInitialized();
    error SupplyTooLarge();
    error StringTooLong();
    error LaunchDelayActive(uint256 opensAt);
    error BuyTooLarge(uint256 maxBuy);
    error CreatorBuyTooLarge(uint256 remaining);
    error PositionLocked(uint256 releasable);

    /**
     * `launcher_` est passé plutôt que déduit de `msg.sender`.
     *
     * Le token n'est plus construit par le launcher lui-même mais par
     * `RevealTokenFactory` : le code de création d'un contrat est embarqué dans
     * celui qui l'instancie, et le launcher touchait la limite de 24 576 octets
     * de l'EVM. Déduire le launcher de l'appelant désignerait donc la fabrique,
     * qui n'a aucun droit ici. La fabrique n'ajoute aucun pouvoir : elle refuse
     * tout appelant autre que le launcher, et la suite ne dépend que de
     * `launcher_`.
     */
    constructor(
        address launcher_,
        string memory name_,
        string memory symbol_,
        LaunchMeta memory meta,
        uint256 supply,
        Rules memory rules_
    ) ERC20(name_, symbol_) {
        if (supply > MAX_SUPPLY) revert SupplyTooLarge();
        if (
            bytes(name_).length == 0 || bytes(name_).length > MAX_NAME_BYTES
                || bytes(symbol_).length == 0 || bytes(symbol_).length > MAX_SYMBOL_BYTES
                || bytes(meta.uri).length > MAX_METADATA_BYTES
                || bytes(meta.logo).length > MAX_LINK_BYTES
                || bytes(meta.description).length > MAX_DESCRIPTION_BYTES
        ) revert StringTooLong();

        RevealRules.validate(rules_);
        rules = rules_;
        metadataURI = meta.uri;
        logo = meta.logo;
        description = meta.description;
        _socials = meta.socials;
        launcher = launcher_;
        _mint(launcher_, supply);
    }

    /**
     * Arme les règles. Jusqu'à cet appel les transferts sont libres, ce qui
     * laisse le launcher poser la liquidité ; après, plus rien ne peut être
     * changé — il n'existe aucune autre fonction d'écriture sur la config.
     */
    function initialize(
        address pool_,
        address quote_,
        address feeTreasury_,
        address creator_
    ) external {
        if (msg.sender != launcher) revert OnlyLauncher();
        if (pool != address(0)) revert AlreadyInitialized();

        pool = pool_;
        quote = quote_;
        feeTreasury = feeTreasury_;
        creator = creator_;
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
     * Ticks de perte latente sur la part encore verrouillée. Un tick est un pas
     * de 1,0001× ; l'interface convertit en pourcentage, ce qui est trivial hors
     * chaîne et coûteux dessus.
     */
    function drawdownTicks(address holder) public view returns (uint256) {
        Position memory p = positions[holder];
        if (p.lockedBasis == 0) return 0;

        /**
         * Aucun relief tant que la position n'a pas au moins une fenêtre de TWAP
         * derrière elle.
         *
         * Sans ce délai, les deux bouts de la comparaison se chevauchent : le
         * TWAP « courant » contient encore le prix d'avant l'achat, donc une
         * position toute neuve se mesure contre un passé dont elle fait
         * elle-même partie. C'est la moitié du défaut corrigé ici ; l'autre
         * moitié est le tick d'entrée, voir `_recordBuy`.
         */
        if (block.timestamp - p.lockStart < TWAP_PERIOD) return 0;

        // Sans TWAP disponible, aucun relief. Retomber sur le spot ici
        // laisserait quiconque faire plonger le prix d'un bloc pour débloquer
        // sa propre position — la seule manipulation qui serait rentable.
        (int24 now_, bool fresh) = twapTick();
        if (!fresh) return 0;

        // Le sens du prix dépend de l'ordre des tokens dans la paire : si notre
        // token est token0, le prix est « quote par token » et baisser le prix
        // fait baisser le tick. S'il est token1, c'est l'inverse.
        int256 drop = tokenIsToken0
            ? int256(p.lockTick) - int256(now_)
            : int256(now_) - int256(p.lockTick);
        return drop <= 0 ? 0 : uint256(drop);
    }

    /**
     * Part de la tranche verrouillée qui est libérée, temps et perte latente
     * confondus. Vaut 100 % pour qui n'a aucune tranche — donc pour tout solde
     * reçu par simple transfert, qui n'est jamais reverrouillé.
     */
    function unlockedBps(address holder) public view returns (uint256) {
        Position memory p = positions[holder];
        if (p.lockedBasis == 0) return BPS;

        uint256 byTime = rules.timeUnlockedBps(block.timestamp - p.lockStart);
        uint256 byRelief = RevealRules.reliefBps(drawdownTicks(holder));
        return byRelief > byTime ? byRelief : byTime;
    }

    /**
     * Ce qui, dans le solde, ne peut pas encore sortir.
     *
     * Borné par le solde, et ce n'est pas une précaution d'écriture : le relief
     * n'est pas monotone. Une position peut être largement libérée par une
     * chute de prix, en profiter pour sortir l'essentiel, puis voir le prix se
     * redresser — le relief retombe alors, et la part verrouillée brute repasse
     * au-dessus du peu qui reste. Trouvé par les tests d'invariants, sur une
     * suite d'actions aléatoires.
     *
     * Le plafonnement rend l'énoncé exact : `releasable + lockedOf == solde`,
     * toujours. Il ne concède rien — il dit « tout ce que vous détenez est
     * bloqué », qui est la lecture la plus restrictive. Et l'échéance reste
     * tenue : la composante temporelle atteint 100 % à `unlockSeconds` quoi
     * qu'ait fait le prix entre-temps.
     */
    function lockedOf(address holder) public view returns (uint256) {
        Position memory p = positions[holder];
        if (p.lockedBasis == 0) return 0;

        uint256 unlocked = unlockedBps(holder);
        if (unlocked >= BPS) return 0;

        uint256 raw = (uint256(p.lockedBasis) * (BPS - unlocked)) / BPS;
        uint256 balance = balanceOf(holder);
        return raw > balance ? balance : raw;
    }

    /**
     * Ce que la position peut laisser sortir maintenant, tous canaux confondus —
     * vente au pool comme transfert vers un wallet. C'est cette vue qu'une
     * interface doit lire avant de signer.
     */
    function releasable(address holder) public view returns (uint256) {
        // `lockedOf` est déjà borné par le solde, donc la soustraction est sûre
        // et la décomposition exacte.
        return balanceOf(holder) - lockedOf(holder);
    }

    /// Nom historique de `releasable`, conservé pour les intégrations. Les deux
    /// portes de sortie ayant fusionné, il n'y a plus qu'un seul nombre.
    function sellableNow(address holder) external view returns (uint256) {
        return releasable(holder);
    }

    /// L'instant où le premier achat devient possible.
    function buyOpensAt() external view returns (uint256) {
        return launchedAt + rules.launchDelay;
    }

    /**
     * Ce qu'il reste au créateur sur sa fenêtre d'achat, en tokens. Zéro dès le
     * bloc suivant : la fenêtre ne se rouvre pas.
     */
    function creatorBuyRemaining() public view returns (uint256) {
        if (pool == address(0) || block.timestamp != launchedAt) return 0;
        uint256 cap = (totalSupply() * CREATOR_BUY_MAX_BPS) / BPS;
        return cap > creatorBought ? cap - creatorBought : 0;
    }

    /**
     * Le plus gros achat que les règles laissent passer à cet instant, en tokens.
     *
     * Le pendant de `releasable` du côté des achats. Sans lui, un achat trop gros
     * ne peut qu'échouer en « TF », que l'utilisateur lit comme une panne — alors
     * que le motif est déterminé d'avance.
     *
     * Zéro pendant le délai. La supply entière quand la rampe est ouverte : à ce
     * moment aucune règle ne borne plus l'achat.
     */
    function maxBuyNow() public view returns (uint256) {
        if (pool == address(0)) return 0;

        uint256 sinceLaunch = block.timestamp - launchedAt;
        if (sinceLaunch < rules.launchDelay) return 0;

        uint256 maxBps = rules.rampBps(sinceLaunch);
        if (maxBps >= BPS) return totalSupply();
        return (totalSupply() * maxBps) / BPS;
    }

    // ------------------------------------------------------------- transferts

    function _update(address from, address to, uint256 value) internal override {
        // Émission, destruction, et toute la phase d'amorçage : rien à mesurer.
        if (from == address(0) || to == address(0) || pool == address(0)) {
            super._update(from, to, value);
            return;
        }

        if (from == pool) {
            // Les frais versés à la trésorerie ne subissent pas la rampe — la
            // collecte est permissionless et ne doit pas dépendre de l'heure —
            // mais ils ouvrent bien une position.
            if (to != feeTreasury) _guardBuy(to, value);
            _recordBuy(to, value);
        } else {
            /**
             * Toute sortie se mesure de la même façon, qu'elle aille au pool ou
             * à un wallet. C'est ce qui empêche d'éclater une position
             * verrouillée sur dix adresses pour la vendre : le budget est
             * consommé au départ, pas à l'arrivée.
             *
             * Corollaire voulu, et c'est la règle 5 de la revue : ce qui sort
             * était déjà libre, donc le destinataire le reçoit libre. Recevoir
             * un token ne reverrouille jamais rien.
             */
            uint256 free = releasable(from);
            if (value > free) revert PositionLocked(free);
            emit Exit(from, value, unlockedBps(from), to == pool);
        }

        super._update(from, to, value);

        // Un solde ramené à zéro n'a plus de tranche. Sans cet effacement, une
        // position sortie puis reconstituée traînerait son ancien `lockTick`.
        if (from != pool && balanceOf(from) == 0) delete positions[from];
    }

    function _guardBuy(address to, uint256 value) private {
        uint256 sinceLaunch = block.timestamp - launchedAt;

        /**
         * La fenêtre d'achat du créateur : le bloc du lancement, et lui seul.
         *
         * Bornée au bloc plutôt qu'à la transaction, parce qu'un contrat ne
         * peut pas distinguer les deux — et cumulée, parce que sinon plusieurs
         * transactions dans ce même bloc rendraient le plafond décoratif.
         *
         * Elle ne dispense que du délai. Tout le reste s'applique : la position
         * ouverte est ordinaire, et `_recordBuy` la verrouille comme les autres
         * juste après.
         */
        if (to == creator && sinceLaunch == 0) {
            uint256 cap = (totalSupply() * CREATOR_BUY_MAX_BPS) / BPS;
            uint256 bought = creatorBought + value;
            if (bought > cap) revert CreatorBuyTooLarge(cap - creatorBought);
            creatorBought = bought;
            return;
        }

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

    /**
     * Fusion d'une acquisition dans la tranche verrouillée.
     *
     * Le principe tient en une ligne : on additionne ce qui est *encore*
     * verrouillé — l'ancien reliquat et la part bloquée du nouvel achat — puis
     * on redimensionne la tranche pour que cette somme corresponde à l'âge zéro.
     *
     * Ce que ça garantit, et que l'ancienne moyenne pondérée ne garantissait
     * pas : la quantité libre avant l'achat est intacte après, augmentée
     * exactement du déblocage initial du nouvel achat. Autrement dit
     *
     *     releasable' = releasable + montant × initialUnlockBps / BPS
     *
     * quels que soient l'historique du détenteur et sa poussière résiduelle.
     * L'ancienne version comparait un budget recalculé à une dette cumulée, et
     * cette dette pouvait dépasser le budget — un rachat commençait alors à zéro.
     *
     * L'horloge repart à `block.timestamp` pour tout le reliquat. C'est
     * délibérément conservateur : racheter rajeunit la part encore bloquée, donc
     * rien ne se débloque jamais plus tôt que promis. Ce qui était déjà libre
     * l'est resté — c'est du solde, pas de la tranche.
     */
    function _recordBuy(address to, uint256 value) private {
        Position storage p = positions[to];
        uint256 initial = rules.initialUnlockBps;

        uint256 lockedOld = lockedOf(to);
        uint256 lockedNew = (value * (BPS - initial)) / BPS;
        uint256 total = lockedOld + lockedNew;

        /**
         * Le prix d'entrée est relevé au spot — le prix marginal que l'acheteur
         * vient effectivement de payer.
         *
         * Ce spot était déjà là, mais il était comparé, dans le même bloc, au
         * TWAP courant qui n'avait pas encore bougé. Un achat déplaçant le tick
         * de plus de 6 932 pas — un doublement du prix, banal sur un pool
         * unilatéral qui démarre — se déclarait donc en perte de moitié à
         * l'instant même de son achat, s'accordait 100 % de relief et sortait du
         * calendrier de déblocage tout entier. Mesuré : 10 967 ticks de perte
         * fabriquée pour un achat d'un seul ether.
         *
         * Le défaut n'était pas ici mais dans la comparaison. `drawdownTicks`
         * n'accorde plus rien tant qu'une fenêtre de TWAP entière ne s'est pas
         * écoulée depuis l'entrée. Passé ce délai la fenêtre ne contient plus
         * aucun prix d'avant l'achat : à prix inchangé le TWAP rejoint ce spot
         * et l'écart vaut zéro, tandis qu'une vraie baisse se lit toujours.
         *
         * Prendre le TWAP ici, à la place, aurait aussi fermé la faille — mais
         * en attribuant à l'acheteur un prix d'entrée qu'il n'a pas payé : entré
         * pendant une hausse, il ne recevait plus aucun relief après un
         * effondrement bien réel. Vérifié, et refusé pour cette raison.
         *
         * Imprécision résiduelle, assumée : le spot est le prix *marginal* de
         * fin de swap, alors que l'achat s'est payé au prix *moyen* du trajet.
         * Un très gros achat se voit donc attribuer une entrée un peu au-dessus
         * de son coût réel, et obtient son relief pour une perte un peu moindre
         * que celle annoncée. Le montant de quote entrant n'est pas lisible
         * depuis un hook ERC-20 — c'est la même limite qui a fait retirer le
         * plafond d'impact — donc le prix moyen n'est pas calculable ici.
         *
         * Repli sur le spot quand l'oracle n'a pas d'historique : au tout
         * premier bloc il n'y a rien à moyenner.
         */
        (, int24 tick,,,,,) = IUniswapV3Pool(pool).slot0();

        if (total == 0) {
            delete positions[to];
            emit Entry(to, value, uint64(block.timestamp), tick);
            return;
        }

        p.lockTick = int24(
            (int256(p.lockTick) * int256(lockedOld) + int256(tick) * int256(lockedNew))
                / int256(total)
        );
        p.lockStart = uint64(block.timestamp);
        // Arrondi vers le haut : la part verrouillée ne doit jamais être
        // sous-estimée par une troncature.
        p.lockedBasis = uint128(Math.ceilDiv(total * BPS, BPS - initial));

        emit Entry(to, value, p.lockStart, p.lockTick);
    }
}
