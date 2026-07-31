import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Boxes,
  CircleDot,
  Coins,
  FileCode2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ListTree,
  Radio,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
} from "lucide-react";

export type DocLink = { id: string; label: string; icon: LucideIcon };
export type DocGroup = { title: string; items: DocLink[] };

export const DOC_NAV: DocGroup[] = [
  {
    title: "Getting started",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "quickstart", label: "Quickstart", icon: Rocket },
      { id: "lifecycle", label: "Launch lifecycle", icon: ListTree },
    ],
  },
  {
    title: "Core concepts",
    items: [
      { id: "positions", label: "Positions", icon: Boxes },
      { id: "sellable", label: "Sellable amount", icon: Gauge },
      { id: "enforcement", label: "Enforcement", icon: ShieldCheck },
      { id: "oracle", label: "Price oracle", icon: Radio },
    ],
  },
  {
    title: "Parameters",
    items: [
      { id: "unlock", label: "Unlock schedule", icon: Timer },
      { id: "relief", label: "Drawdown relief", icon: CircleDot },
      { id: "graduation", label: "Revealed", icon: SlidersHorizontal },
      { id: "antisniper", label: "Anti-sniper", icon: ShieldCheck },
      { id: "devbuy", label: "Dev buy", icon: Coins },
    ],
  },
  {
    title: "Reference",
    items: [
      { id: "deployment", label: "Deployment", icon: KeyRound },
      { id: "metadata", label: "Token metadata", icon: FileCode2 },
      { id: "interface", label: "Interface", icon: FileCode2 },
      { id: "events", label: "Events", icon: Radio },
      { id: "errors", label: "Errors", icon: AlertTriangle },
      { id: "fees", label: "Fees", icon: Coins },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "indexing", label: "Indexing", icon: KeyRound },
      { id: "limits", label: "Known limits", icon: AlertTriangle },
    ],
  },
];

/**
 * Un paramètre du protocole, tel qu'il est réellement écrit dans les contrats.
 *
 * `value` est la valeur qu'utilise **tout** lancement : elle vit dans le
 * launcher, qui n'a aucune fonction pour la modifier. `bound` est la borne que
 * `RevealRules.validate` accepte — utile pour savoir ce qui est structurellement
 * possible, pas ce qu'un créateur peut choisir. Personne ne choisit.
 */
export type Param = {
  name: string;
  type: string;
  bound: string;
  value: string;
  description: string;
};

export const UNLOCK_PARAMS: Param[] = [
  {
    name: "initialUnlockBps",
    type: "uint16",
    bound: "≤ 5000",
    value: "1000",
    description:
      "Share of a position sellable the moment it is bought. A tenth: enough to leave before the chart has moved, not enough to empty the pool.",
  },
  {
    name: "unlockSeconds",
    type: "uint32",
    bound: "15min – 7d",
    value: "900",
    description:
      "Seconds from entry to fully sellable, on a straight line from initialUnlockBps to 10000. Buying more re-weights entry time downward, so topping up makes a position younger. The floor is three TWAP windows: any shorter and the relief mechanism would cover most of the constraint's life, leaving no constraint.",
  },
];

/**
 * Le dev buy. Il est décrit ici avec les autres paramètres, et pas dans une
 * page marketing : c'est le seul avantage que le protocole accorde à quelqu'un,
 * donc il se lit au même endroit que les règles qui s'appliquent à tous.
 */
export const CREATOR_BUY_PARAMS: Param[] = [
  {
    name: "CREATOR_BUY_MAX_BPS",
    type: "uint16",
    bound: "constant",
    value: "500",
    description:
      "Most of the supply a creator may buy in their own launch transaction — five percent, about 0.072 ETH on this curve. Cumulative across the launch block, not per transaction, so several buys cannot walk around it.",
  },
  {
    name: "creator window",
    type: "block",
    bound: "launch block",
    value: "—",
    description:
      "The creator, and only the creator, may buy while launchDelay is still running — but only in the block that launched the token. One second later they are an ordinary buyer facing the same anti-sniper delay as everyone else.",
  },
  {
    name: "what it does not grant",
    type: "—",
    bound: "—",
    value: "—",
    description:
      "Nothing on the way out. Tokens bought this way open an ordinary position: same initialUnlockBps, same unlockSeconds, same relief. The creator can buy earlier, never sell earlier.",
  },
];

export const RELIEF_PARAMS: Param[] = [
  {
    name: "HALVING_TICKS",
    type: "uint256",
    bound: "constant",
    value: "6932",
    description:
      "Uniswap ticks between a price and half of it — ln(0.5)/ln(1.0001). Relief is that ratio, continuous: down 6932 ticks releases everything, down half of that releases half.",
  },
  {
    name: "TWAP_PERIOD",
    type: "uint32",
    bound: "constant",
    value: "300",
    description:
      "Window the current price is averaged over, and the delay before a position earns any relief at all. Relief reads the TWAP for 'now', never spot — spot would let anyone crash the price for one block to unlock themselves. The entry price is the spot the buyer actually paid, so the two ends are only comparable once a full window has passed since the buy; before that, relief is zero.",
  },
  {
    name: "entry price",
    type: "int24",
    bound: "spot at buy",
    value: "—",
    description:
      "The marginal price at the end of the buyer's own swap. It is above their average execution price, so a very large buy earns its relief on a slightly smaller real loss than advertised. The quote amount is not readable from an ERC-20 hook, so the average cannot be computed on chain — stated rather than hidden.",
  },
];

export const GRADUATION_PARAMS: Param[] = [
  {
    name: "GRADUATION_QUOTE",
    type: "uint256",
    bound: "constant",
    value: "4.2 ETH",
    description:
      "Quote held by the locked position at which the launch is considered graduated. A status milestone and nothing else: same token, same pool, same fee tier, same ticks, same liquidity, same permissions. Nothing migrates, and graduation guarantees no exit.",
  },
  {
    name: "graduationProgress(token)",
    type: "uint256",
    bound: "view",
    value: "—",
    description:
      "Quote the protocol's own position actually contains at the current price, derived from its ticks and liquidity. Deliberately not WETH.balanceOf(pool): that balance counts direct donations and unrelated positions, so anyone could trigger graduation by sending ETH. A donation does not move the price, so it does not move this.",
  },
  {
    name: "syncGraduation(token)",
    type: "—",
    bound: "permissionless",
    value: "—",
    description:
      "Records the crossing and emits Graduated once. Anyone may call it; it changes a flag and nothing else. Until it is called, graduated(token) stays false even if progress is above the threshold.",
  },
];

export const SNIPER_PARAMS: Param[] = [
  {
    name: "launchDelay",
    type: "uint32",
    bound: "≤ 3600",
    value: "5",
    description:
      "Seconds after the pool opens before any buy is accepted. Long enough to break the same-block advantage, short enough that a human is not left waiting.",
  },
  {
    name: "buyRamp",
    type: "uint32",
    bound: "≤ 86400",
    value: "600",
    description:
      "Period over which the cap on a single buy grows from RAMP_START_BPS to no cap at all, measured against total supply.",
  },
  {
    name: "RAMP_START_BPS",
    type: "uint256",
    bound: "constant",
    value: "25",
    description:
      "Cap on one buy at the opening of the ramp: 0.25% of supply. It rises linearly from there.",
  },
];

/**
 * Les adresses réellement en place sur Robinhood Chain.
 *
 * Écrites ici et pas seulement dans `contracts/deployments/4663.json` : une
 * documentation qui décrit un protocole sans dire où il est ne permet à
 * personne de vérifier quoi que ce soit. Chacune se relit sur la chaîne, et
 * c'est le but.
 */
export type Deployed = { label: string; address: string; note: string };

export const DEPLOYMENT: Deployed[] = [
  {
    label: "RevealLauncher",
    address: "0x94d97C7AEc431b989132e3664b7cB3613CaC5b81",
    note: "Every launch goes through it. Holds the rules, the supply and the tick range, none of which it can change.",
  },
  {
    label: "RevealLocker",
    address: "0x9D223bd9ebae36a04Ce4c29a4bEE203d7EA1791e",
    note: "Deployed by the launcher, so its launcher() is necessarily the address above. Owns every position NFT and cannot give one back.",
  },
  {
    label: "Treasury",
    address: "0xa40679bC2f4f5B51Edb05E7A2D573292A3479c62",
    note: "Immutable, written into the locker's constructor. Every swap fee ends here and nowhere else; there is no setter.",
  },
  {
    label: "Uniswap V3 factory",
    address: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
    note: "Chain infrastructure, not ours. The launcher checks the position manager reports this same factory before accepting it.",
  },
  {
    label: "NonfungiblePositionManager",
    address: "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3",
    note: "Mints the position straight to the locker. The launcher's copy of its interface deliberately omits decreaseLiquidity, burn, approve and transferFrom.",
  },
  {
    label: "WETH (quote)",
    address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    note: "The only quote asset. Not the OP-stack predeploy — this is an Arbitrum Orbit chain and 0x4200…0006 carries no code here.",
  },
];

/**
 * Le format du document que `metadataURI` porte.
 *
 * Documenté parce qu'il est écrit par qui lance le token, pas par cette
 * interface : un lancement fait en appelant le contrat directement peut y
 * mettre n'importe quoi, et ce qui suit dit ce qui sera affiché.
 */
export const METADATA_RULES: Param[] = [
  {
    name: "document",
    type: "data URI",
    bound: "≤ 16384 bytes",
    value: "JSON, base64",
    description:
      "The whole thing lives in the contract — no IPFS pin, no server, nothing to keep paying for. Base64 rather than percent-encoding: it costs exactly 4/3 whatever the content, while percent-encoding a base64 image can triple it and blow the contract's bound after signature.",
  },
  {
    name: "image",
    type: "string",
    bound: "≤ 8192 bytes",
    value: "data:image/…;base64",
    description:
      "Raster data URI only — png, jpeg, webp or gif. A remote URL is ignored on display: rendering one would make every visitor of the launchpad fetch an address the token creator chose. SVG is ignored too, being a document rather than an image.",
  },
  {
    name: "thumbnail",
    type: "—",
    bound: "256px square",
    value: "webp",
    description:
      "What this interface writes: the source centred on a square canvas, so nothing is cropped by a square tile, at the largest of 256/192/128px that fits the byte budget. Quality drops only after size has, because artefacts read worse than a smaller image.",
  },
  {
    name: "text fields",
    type: "string",
    bound: "1000 / 128 chars",
    value: "—",
    description:
      "description, then website, x, telegram and discord. Control characters and bidirectional marks are dropped on display — the latter can render a string as the reverse of what it contains, which is the exact tool for impersonating another token.",
  },
];

export type EventDef = { signature: string; description: string };

export const EVENTS: EventDef[] = [
  {
    signature:
      "Launched(address token, address creator, address pool, uint256 tokenId, uint256 supply, uint128 liquidity, int24 tickLower, int24 tickUpper, Rules rules)",
    description:
      "Emitted once per launch, by the launcher. tokenId is the Uniswap V3 position NFT, minted straight to the locker. Name, symbol and metadataURI are not repeated here — they are read from the token, which keeps the event off the compiler's stack limit.",
  },
  {
    signature:
      "CreatorBought(address token, address creator, uint256 quoteIn, uint256 tokensOut)",
    description:
      "The creator took the first position inside their own launch transaction. Emitted only when that happened, so a launch that bought its own float is distinguishable from one that did not without reading pool transfers.",
  },
  {
    signature: "Entry(address holder, uint256 amount, uint64 lockStart, int24 lockTick)",
    description:
      "A position acquired tokens from the pool. Carries the merged tranche's state, so an indexer never has to recompute it. A plain incoming transfer emits nothing here: what left the sender was already unlocked, so it arrives unlocked.",
  },
  {
    signature:
      "Exit(address holder, uint256 amount, uint256 unlockedBps, bool viaPool)",
    description:
      "A position let tokens out, and how open it was at that moment. viaPool separates a sell from a plain transfer — both consume the same unlock budget.",
  },
  {
    signature:
      "Registered(address token, address pool, uint256 tokenId, int24 tickLower, int24 tickUpper, uint128 liquidity)",
    description:
      "The locker took permanent ownership of the position. Emitted once per launch, by the locker.",
  },
  {
    signature:
      "Collected(address token, uint256 quoteToTreasury, uint256 tokensToCreator)",
    description:
      "Swap fees were materialised and paid out — the quote side to the immutable treasury, the token side to the launch's creator. Named by recipient rather than by amount0/amount1, which forced every reader to work out which of the two was the quote. Anyone may trigger it, neither destination can be redirected, and the position's liquidity is unchanged by construction.",
  },
  {
    signature: "Graduated(address token, address pool, uint256 quoteAmount)",
    description:
      "The locked position crossed GRADUATION_QUOTE and someone recorded it. Emitted at most once per token. Nothing moved.",
  },
];

export type ErrorDef = { name: string; description: string };

export const ERRORS: ErrorDef[] = [
  {
    name: "LaunchDelayActive(uint256 opensAt)",
    description: "A buy arrived before launchDelay elapsed. Returns when it opens.",
  },
  {
    name: "BuyTooLarge(uint256 maxBuy)",
    description:
      "The buy exceeds what the ramp allows at this point. Returns the size that would pass.",
  },
  {
    name: "CreatorBuyTooLarge(uint256 remaining)",
    description:
      "The creator's buy would carry their launch-block total past CREATOR_BUY_MAX_BPS. Returns what is left under the cap. It fails the whole launch, not just the buy — a half-launched token would be worse.",
  },
  {
    name: "PositionLocked(uint256 releasable)",
    description:
      "The position may not release this much yet. Returns the amount that would succeed — offer that rather than a bare failure.",
  },
  {
    name: "StringTooLong()",
    description:
      "Name, symbol or metadataURI is empty or past its bound — 64, 16 and 16384 bytes. Without a bound, a launch could cost arbitrary gas and the token would be unreadable to any indexer.",
  },
  {
    name: "OnlyLauncher() · AlreadyInitialized()",
    description:
      "Arming the rules is callable once, by the launcher that deployed the token. There is no second path into that state.",
  },
  {
    name: "NotGraduatedYet(uint256 progress) · AlreadyGraduated()",
    description:
      "syncGraduation was called below the threshold, or a second time. Returns the progress it measured so the caller can see how far off it is.",
  },
  {
    name: "QuoteWasSpent(uint256) · SupplyNotDeposited(uint256,uint256) · LiquidityMismatch(uint128,uint128) · WrongInitialTick(int24,int24)",
    description:
      "A launch did not produce exactly what it must: quote was consumed, the supply did not land, the minted liquidity differs from the derived value, or the pool did not open at the intended tick. Each aborts the whole launch rather than leaving a pool with the wrong curve.",
  },
];
