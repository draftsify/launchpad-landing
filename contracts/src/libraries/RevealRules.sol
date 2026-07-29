// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Paramètres d'un lancement. Choisis à la création, jamais modifiables ensuite :
 * c'est la promesse centrale du protocole, donc ils sont `immutable` côté token
 * et validés une seule fois, ici.
 */
struct Rules {
    /// Part vendable dès le premier bloc, en points de base (1000 = 10 %).
    uint16 initialUnlockBps;
    /// Durée, en secondes, jusqu'au déblocage complet d'une position.
    uint32 unlockSeconds;
    /// Plafond de vente par fenêtre, en bps de la réserve du pool.
    uint16 impactCapBps;
    /// Longueur de la fenêtre du plafond, en secondes.
    uint32 impactWindow;
    /// Délai avant le premier achat, en secondes.
    uint32 launchDelay;
    /// Durée de la montée en taille d'achat, en secondes.
    uint32 buyRamp;
}

library RevealRules {
    uint16 internal constant BPS = 10_000;

    /**
     * Pente du drawdown relief : un point de perte ouvre deux points de
     * déblocage. À −50 %, une position est intégralement libérée.
     *
     * Constante du protocole et non paramètre de lancement : c'est la garantie
     * de sortie, laisser un créateur la régler reviendrait à la lui retirer.
     */
    uint256 internal constant RELIEF_SLOPE_BPS = 2 * uint256(BPS);

    /// Taille d'achat autorisée au tout début de la rampe, en bps des réserves.
    uint256 internal constant RAMP_START_BPS = 25;

    error InitialUnlockTooHigh();
    error UnlockWindowOutOfRange();
    error ImpactCapOutOfRange();
    error ImpactWindowOutOfRange();
    error LaunchDelayTooLong();
    error BuyRampTooLong();

    function validate(Rules memory r) internal pure {
        // Un déblocage initial de 100 % rendrait toute la mécanique inerte.
        if (r.initialUnlockBps > 5_000) revert InitialUnlockTooHigh();
        // Bornes hautes : au-delà, le token serait durablement invendable.
        if (r.unlockSeconds < 1 hours || r.unlockSeconds > 7 days) {
            revert UnlockWindowOutOfRange();
        }
        // Un plafond nul bloquerait toute vente ; au-delà de 10 % il ne freine rien.
        if (r.impactCapBps == 0 || r.impactCapBps > 1_000) revert ImpactCapOutOfRange();
        if (r.impactWindow < 1 minutes || r.impactWindow > 1 hours) {
            revert ImpactWindowOutOfRange();
        }
        if (r.launchDelay > 1 hours) revert LaunchDelayTooLong();
        if (r.buyRamp > 1 days) revert BuyRampTooLong();
    }

    /**
     * Part débloquée par le seul écoulement du temps, depuis l'entrée en
     * position. Linéaire : la moitié du temps donne la moitié du chemin entre
     * le déblocage initial et 100 %.
     */
    function timeUnlockedBps(Rules memory r, uint256 heldFor) internal pure returns (uint256) {
        if (heldFor >= r.unlockSeconds) return BPS;
        uint256 span = BPS - r.initialUnlockBps;
        return r.initialUnlockBps + (span * heldFor) / r.unlockSeconds;
    }

    /**
     * Plancher de déblocage ouvert par la perte latente. C'est un plancher et
     * non un bonus : une position déjà libérée par le temps ne gagne rien, une
     * position récente mais très en perte peut sortir malgré tout.
     */
    function reliefBps(uint256 drawdownBps) internal pure returns (uint256) {
        uint256 relief = (drawdownBps * RELIEF_SLOPE_BPS) / BPS;
        return relief > BPS ? BPS : relief;
    }

    /**
     * Taille maximale d'un achat pendant la rampe anti-sniper, en bps des
     * réserves. Part très bas et rejoint « aucune limite » à la fin.
     */
    function rampBps(Rules memory r, uint256 sinceLaunch) internal pure returns (uint256) {
        if (r.buyRamp == 0 || sinceLaunch >= r.buyRamp) return BPS;
        uint256 span = BPS - RAMP_START_BPS;
        return RAMP_START_BPS + (span * sinceLaunch) / r.buyRamp;
    }

    /**
     * Seau percé : la quantité déjà vendue s'efface linéairement sur la durée
     * de la fenêtre. Évite l'effet de bord des fenêtres fixes, où l'on peut
     * vendre deux plafonds d'affilée en enjambant une frontière.
     */
    function decayed(uint256 sold, uint256 elapsed, uint32 window)
        internal
        pure
        returns (uint256)
    {
        if (elapsed >= window) return 0;
        return (sold * (window - elapsed)) / window;
    }
}
