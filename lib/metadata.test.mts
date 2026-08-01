/**
 * Assainissement des métadonnées, éprouvé sur ce qu'un inconnu peut écrire.
 *
 * Ces cas ne sont pas décoratifs : `metadataURI` est un argument de `launch`,
 * donc son contenu n'est pas produit par notre formulaire mais par qui lance le
 * token. Chacun de ces tests correspond à une chose que le site affichait, ou
 * chargeait, avant que `sanitize` existe.
 *
 * Lancé par `npm run test:lib`, sans dépendance : Node exécute le TypeScript en
 * retirant les types.
 */
import { imageSrc, parseMetadata, toDataUri } from "./metadata.ts";

const enc = (o: unknown) =>
  "data:application/json;base64," + Buffer.from(JSON.stringify(o)).toString("base64");

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok    " : "  ECHEC "} ${label}${detail ? "  -> " + detail : ""}`);
};

const png = "data:image/png;base64,iVBORw0KGgo=";
const base = { name: "a", symbol: "A" };

console.log("--- images ---");
check(
  "image distante rejetee",
  parseMetadata(enc({ ...base, image: "https://tracker.example/p.png" }))?.image === undefined
);
check("image data: acceptee", parseMetadata(enc({ ...base, image: png }))?.image === png);
check(
  "svg rejete",
  parseMetadata(enc({ ...base, image: "data:image/svg+xml;base64,PHN2Zz4=" }))?.image === undefined
);
check(
  "data: non-image rejete",
  parseMetadata(enc({ ...base, image: "data:text/html;base64,PGI+" }))?.image === undefined
);
check(
  "base64 malforme rejete",
  parseMetadata(enc({ ...base, image: "data:image/png;base64,<script>" }))?.image === undefined
);

console.log("--- textes ---");
check(
  "description trop longue ignoree",
  parseMetadata(enc({ ...base, description: "x".repeat(1001) }))?.description === undefined
);
check(
  "description normale gardee",
  parseMetadata(enc({ ...base, description: "Accents: éàü" }))?.description ===
    "Accents: éàü"
);
check(
  "caractere de controle rejete",
  parseMetadata(enc({ ...base, description: "avantapres" }))?.description === undefined
);
check(
  "marque bidi rejetee",
  parseMetadata(enc({ ...base, description: "REVEAL‮gnitekaf" }))?.description === undefined
);

console.log("--- liens ---");
check(
  "javascript: rejete",
  parseMetadata(enc({ ...base, website: "javascript:alert(1)" }))?.website === undefined
);
check("domaine accepte", parseMetadata(enc({ ...base, website: "reveal.xyz" }))?.website === "reveal.xyz");
check(
  "https retire du domaine",
  parseMetadata(enc({ ...base, website: "https://reveal.xyz/docs" }))?.website === "reveal.xyz/docs"
);
// Le cas qui a fait disparaitre les liens du premier vrai lancement.
check(
  "chaine de requete conservee",
  parseMetadata(enc({ ...base, website: "https://x.com/search?q=leafcat&src=typed_query" }))
    ?.website === "x.com/search?q=leafcat&src=typed_query"
);
check(
  "hote sans point rejete",
  parseMetadata(enc({ ...base, website: "localhost/admin" }))?.website === undefined
);
check(
  "identifiants dans l'autorite rejetes",
  parseMetadata(enc({ ...base, website: "https://x.com@evil.example/" }))?.website === undefined
);
check("pseudo x accepte", parseMetadata(enc({ ...base, x: "launchonreveal" }))?.x === "launchonreveal");
check(
  "url x complete ramenee au pseudo",
  parseMetadata(enc({ ...base, x: "https://x.com/launchonreveal" }))?.x === "launchonreveal"
);
check(
  "arobase retiree du pseudo",
  parseMetadata(enc({ ...base, x: "@launchonreveal" }))?.x === "launchonreveal"
);
check(
  "recherche x refusee comme pseudo",
  parseMetadata(enc({ ...base, x: "https://x.com/search?q=leafcat" }))?.x === undefined
);
check(
  "url telegram ramenee au pseudo",
  parseMetadata(enc({ ...base, telegram: "https://t.me/revealchat" }))?.telegram === "revealchat"
);

console.log("--- ipfs ---");
const cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
check(
  "ipfs:// est accepte dans image",
  parseMetadata(enc({ ...base, image: `ipfs://${cid}` }))?.image === `ipfs://${cid}`
);
check(
  "un cid malforme est refuse",
  parseMetadata(enc({ ...base, image: "ipfs://pas-un-cid" }))?.image === undefined
);
check(
  "un chemin apres le cid est refuse",
  parseMetadata(enc({ ...base, image: `ipfs://${cid}/../secret` }))?.image === undefined
);
check(
  "https:// reste refuse",
  parseMetadata(enc({ ...base, image: "https://example.com/logo.png" }))?.image ===
    undefined
);
check(
  "thumbnail n'accepte que du data uri",
  parseMetadata(enc({ ...base, thumbnail: `ipfs://${cid}` }))?.thumbnail === undefined
);
check(
  "un ancien document met sa vignette dans les deux champs",
  (() => {
    const old = parseMetadata(enc({ ...base, image: png }));
    return old?.image === png && old?.thumbnail === png;
  })()
);
check(
  "imageSrc prefere la vignette de la chaine",
  imageSrc(parseMetadata(enc({ ...base, image: `ipfs://${cid}`, thumbnail: png }))) === png
);
check(
  "imageSrc passe par notre passerelle sans vignette",
  imageSrc(parseMetadata(enc({ ...base, image: `ipfs://${cid}` }))) ===
    `/api/ipfs/${cid}`
);

console.log("--- documents casses ---");
check("json invalide -> null", parseMetadata("data:application/json;base64,####") === null);
check("uri non json -> null", parseMetadata("https://example.com/meta.json") === null);
check("tableau -> null", parseMetadata(enc([1, 2, 3])) === null);

console.log("--- aller-retour ---");
const round = toDataUri({
  name: "Reveal",
  symbol: "RVL",
  description: "éàü 中文",
  image: png,
  website: "reveal.xyz",
});
const back = parseMetadata(round);
check(
  "toDataUri -> parseMetadata conserve tout",
  back?.description === "éàü 中文" &&
    back?.image === png &&
    back?.website === "reveal.xyz",
  JSON.stringify(back)
);

/**
 * ERC-1046 attend `decimals` dans le document rendu par `tokenURI()`, et c'est
 * ce document-là que le contrat rend. Le champ ne sert à rien à l'affichage :
 * seul un indexeur le lit, et c'est précisément pour lui qu'il est écrit.
 */
const written = JSON.parse(
  Buffer.from(round.slice(round.indexOf(",") + 1), "base64").toString("utf8")
);
check("le document porte decimals: 18 (ERC-1046)", written.decimals === 18);

console.log(`\n${pass} ok, ${fail} echec(s)`);
process.exit(fail ? 1 : 0);
