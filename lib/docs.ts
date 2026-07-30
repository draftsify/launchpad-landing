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
      { id: "impact", label: "Impact caps", icon: SlidersHorizontal },
      { id: "antisniper", label: "Anti-sniper", icon: ShieldCheck },
    ],
  },
  {
    title: "Reference",
    items: [
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
    bound: "1h – 7d",
    value: "3600",
    description:
      "Seconds from entry to fully sellable, on a straight line from initialUnlockBps to 10000. Buying more re-weights entry time downward, so topping up makes a position younger.",
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
      "Window the drawdown is measured over. Relief reads the TWAP, never spot: spot would let anyone crash the price for one block to unlock their own position.",
  },
];

export const IMPACT_PARAMS: Param[] = [
  {
    name: "impactCapBps",
    type: "uint16",
    bound: "1 – 1000",
    value: "1000",
    description:
      "Most one position may sell per window, as a share of the pool's quote reserve — the side that actually absorbs the impact. Measured against tokens it would mean nothing: at launch the pool holds the entire supply.",
  },
  {
    name: "impactWindow",
    type: "uint32",
    bound: "60 – 3600",
    value: "300",
    description:
      "Length of the rolling window. A leaky bucket, not a reset: what was sold fades linearly, so a refused remainder becomes available gradually instead of all at once on a boundary.",
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

export type EventDef = { signature: string; description: string };

export const EVENTS: EventDef[] = [
  {
    signature:
      "Launched(address token, address creator, address pool, uint256 supply, int24 tickLower, int24 tickUpper, Rules rules)",
    description:
      "Emitted once per launch, by the launcher. Name, symbol and metadataURI are not repeated here — they are read from the token, which keeps the event off the compiler's stack limit.",
  },
  {
    signature:
      "Entry(address holder, uint256 amount, uint64 entryTime, int24 basisTick)",
    description:
      "A position received tokens — a buy or an incoming transfer. Carries the position's state after re-weighting, so an indexer never has to average anything itself.",
  },
  {
    signature:
      "Exit(address holder, uint256 amount, uint256 unlockedBps, bool viaPool)",
    description:
      "A position let tokens out, and how open it was at that moment. viaPool separates a sell from a plain transfer — both consume the same unlock budget.",
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
    name: "PositionLocked(uint256 releasable)",
    description:
      "The position may not release this much yet. Returns the amount that would succeed — offer that rather than a bare failure.",
  },
  {
    name: "ImpactCapExceeded(uint256 remaining)",
    description:
      "The position has used its share of the current window. Returns what is left in it.",
  },
  {
    name: "OnlyLauncher() · AlreadyInitialized()",
    description:
      "Arming the rules is callable once, by the launcher that deployed the token. There is no second path into that state.",
  },
];
