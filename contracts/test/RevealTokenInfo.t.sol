// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevealBase} from "./RevealBase.t.sol";
import {RevealToken} from "../src/RevealToken.sol";
import {RevealTokenFactory} from "../src/RevealTokenFactory.sol";
import {LaunchMeta, Socials, TokenInfo} from "../src/RevealTypes.sol";
import {Rules} from "../src/libraries/RevealRules.sol";

/**
 * Ce que la chaîne lit d'un lancement sans rien savoir de Reveal.
 *
 * L'enjeu de ces tests n'est pas qu'un champ soit stocké — c'est qu'il soit
 * lisible sous le nom exact que les outils de cette chaîne interrogent. Un
 * `logo()` qui rendrait la bonne valeur sous un autre nom ne servirait à rien,
 * et c'est précisément l'erreur qu'on répare ici.
 */
contract RevealTokenInfoTest is RevealBase {
    string internal constant LOGO = "ipfs://bafkreifcpeql3wtou62agny7bysr7bsuzv2l5phrd5b7yd5ziiqlip7xoa";

    function _meta() internal pure returns (LaunchMeta memory) {
        return LaunchMeta({
            uri: METADATA_URI,
            logo: LOGO,
            description: "Un lancement qui se laisse indexer.",
            socials: Socials({
                telegram: "revealchat",
                twitter: "launchonreveal",
                discord: "AbCd1234",
                website: "launchonreveal.com",
                farcaster: "reveal"
            })
        });
    }

    function _launchWithMeta() internal returns (RevealToken t) {
        vm.prank(creator);
        (address addr,) = launcher.launch("Indexed", "IDX", _meta());
        t = RevealToken(addr);
    }

    function test_LogoIsReadableUnderTheNameThisChainUses() public {
        assertEq(_launchWithMeta().logo(), LOGO, "logo() ne rend pas le CID");
    }

    function test_DescriptionIsReadableSeparately() public {
        assertEq(
            _launchWithMeta().description(),
            "Un lancement qui se laisse indexer.",
            "description() ne rend pas le texte"
        );
    }

    /// L'ordre des champs compte autant que leur contenu : un décodeur écrit
    /// contre l'autre launchpad lit des positions, pas des noms.
    function test_SocialsKeepTheReferenceFieldOrder() public {
        Socials memory s = _launchWithMeta().socials();
        assertEq(s.telegram, "revealchat", "1 telegram");
        assertEq(s.twitter, "launchonreveal", "2 twitter");
        assertEq(s.discord, "AbCd1234", "3 discord");
        assertEq(s.website, "launchonreveal.com", "4 website");
        assertEq(s.farcaster, "reveal", "5 farcaster");
    }

    function test_GetTokenInfoBundlesTheSameValues() public {
        RevealToken t = _launchWithMeta();
        TokenInfo memory info = t.getTokenInfo();

        assertEq(info.deployer, creator, "deployer");
        assertEq(info.logo, t.logo(), "logo divergent");
        assertEq(info.description, t.description(), "description divergente");
        assertEq(info.socials.twitter, "launchonreveal", "socials divergents");
    }

    /// `deployer()` et `creator()` doivent désigner la même adresse : deux
    /// vocabulaires pour une seule vérité.
    function test_DeployerIsTheCreator() public {
        RevealToken t = _launchWithMeta();
        assertEq(t.deployer(), t.creator(), "deployer != creator");
        assertEq(t.deployer(), creator, "ce n'est pas le lanceur");
    }

    /// L'ancien point d'entrée reste utilisable, et rend des champs vides
    /// plutôt que de refuser : rien de ce qui marchait ne doit cesser.
    function test_TheThreeStringLaunchStillWorksAndLeavesTheFieldsEmpty() public view {
        assertEq(token.logo(), "", "logo non vide");
        assertEq(token.description(), "", "description non vide");
        assertEq(token.socials().twitter, "", "socials non vides");
        assertEq(token.metadataURI(), METADATA_URI, "le document a ete perdu");
    }

    // --------------------------------------------------------------- bornes

    function test_RejectsAnOversizedLogo() public {
        LaunchMeta memory meta = _meta();
        meta.logo = new string(token.MAX_LINK_BYTES() + 1);
        vm.expectRevert(RevealToken.StringTooLong.selector);
        launcher.launch("Indexed", "IDX", meta);
    }

    function test_RejectsAnOversizedDescription() public {
        LaunchMeta memory meta = _meta();
        meta.description = new string(token.MAX_DESCRIPTION_BYTES() + 1);
        vm.expectRevert(RevealToken.StringTooLong.selector);
        launcher.launch("Indexed", "IDX", meta);
    }

    // -------------------------------------------------------------- fabrique

    /**
     * La fabrique n'ouvre aucune porte.
     *
     * Elle n'existe que parce que le launcher touchait la limite de taille de
     * l'EVM. Si elle acceptait n'importe quel appelant, un inconnu pourrait
     * fabriquer un token qui se réclame de notre launcher — inerte, faute
     * d'initialisation, mais portant notre nom.
     */
    function test_AStrangerCannotUseTheFactory() public {
        Rules memory r = defaultRules();
        vm.prank(alice);
        vm.expectRevert(RevealTokenFactory.NotLauncher.selector);
        tokenFactory.deploy("Fake", "FAKE", _meta(), SUPPLY, r);
    }

    function test_TheFactoryIsAttachedOnceAndOnlyToOurLauncher() public {
        assertEq(tokenFactory.launcher(), address(launcher), "mauvaise attache");

        vm.expectRevert(RevealTokenFactory.AlreadyAttached.selector);
        tokenFactory.attach(address(0xdead));
    }

    function test_OnlyTheDeployerOfTheFactoryCanAttachIt() public {
        RevealTokenFactory fresh = new RevealTokenFactory();
        vm.prank(alice);
        vm.expectRevert(RevealTokenFactory.NotAdmin.selector);
        fresh.attach(address(launcher));
    }

    /// Le token appartient au launcher, pas à la fabrique : sans quoi la supply
    /// serait frappée à une adresse qui ne sait pas la déposer en liquidité.
    function test_TheFactoryHoldsNothingAndOwnsNothing() public {
        RevealToken t = _launchWithMeta();
        assertEq(t.balanceOf(address(tokenFactory)), 0, "la fabrique detient des tokens");
        assertEq(t.launcher(), address(launcher), "le launcher du token n'est pas le launcher");
    }
}
