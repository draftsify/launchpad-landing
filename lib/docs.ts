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

export type Param = {
  name: string;
  type: string;
  range: string;
  fallback: string;
  description: string;
};

export const UNLOCK_PARAMS: Param[] = [
  {
    name: "initialUnlock",
    type: "uint16",
    range: "0 – 10000 bps",
    fallback: "1000",
    description:
      "Share of a position sellable the moment it is bought. Set it too low and holders feel trapped before the chart has moved.",
  },
  {
    name: "unlockDuration",
    type: "uint32",
    range: "1h – 30d",
    fallback: "86400",
    description:
      "Seconds for a position to reach fully sellable, before any size or drawdown adjustment.",
  },
];

export const RELIEF_PARAMS: Param[] = [
  {
    name: "reliefThresholds",
    type: "uint16[4]",
    range: "0 – 10000 bps",
    fallback: "[1000, 2000, 4000]",
    description:
      "Drawdown levels, measured against entry price, at which relief tiers activate.",
  },
  {
    name: "reliefUnlock",
    type: "uint16[4]",
    range: "0 – 10000 bps",
    fallback: "[3000, 5000, 9500]",
    description:
      "Sellable share granted at each tier. Values are floors: a position never unlocks less than its time-based schedule already allows.",
  },
];

export const IMPACT_PARAMS: Param[] = [
  {
    name: "impactCap",
    type: "uint16",
    range: "10 – 2000 bps",
    fallback: "100",
    description:
      "Maximum share of pool liquidity one wallet may move within a window.",
  },
  {
    name: "impactWindow",
    type: "uint32",
    range: "60 – 3600 s",
    fallback: "300",
    description: "Rolling window over which impactCap is measured.",
  },
];

export const SNIPER_PARAMS: Param[] = [
  {
    name: "launchDelay",
    type: "uint32",
    range: "0 – 600 s",
    fallback: "30",
    description:
      "Seconds after deployment before the first buy is accepted. Removes the same-block advantage.",
  },
  {
    name: "buyRamp",
    type: "uint32",
    range: "0 – 1800 s",
    fallback: "600",
    description:
      "Period during which the maximum buy size grows from buyFloor to unlimited.",
  },
  {
    name: "buyFloor",
    type: "uint16",
    range: "1 – 500 bps",
    fallback: "50",
    description:
      "Starting cap on a single buy, as a share of total supply, at the opening of the ramp.",
  },
];

export type EventDef = { signature: string; description: string };

export const EVENTS: EventDef[] = [
  {
    signature: "PositionOpened(address owner, uint256 amount, uint256 price)",
    description:
      "Emitted on every buy. Carries the entry price and the liquidity snapshot used to size the unlock.",
  },
  {
    signature: "PositionReduced(address owner, uint256 id, uint256 amount)",
    description: "Emitted on every accepted sell, partial or full.",
  },
  {
    signature: "SellRejected(address owner, uint256 requested, uint256 allowed)",
    description:
      "Emitted when a sell exceeds the sellable amount. Useful for surfacing why a trade failed.",
  },
  {
    signature: "ReliefTierReached(uint256 id, uint8 tier)",
    description: "Emitted the first time a position crosses a drawdown tier.",
  },
];

export type ErrorDef = { name: string; description: string };

export const ERRORS: ErrorDef[] = [
  {
    name: "ExceedsSellable(uint256 allowed)",
    description:
      "The sell is larger than what the position may currently release. The returned value is the amount that would succeed.",
  },
  {
    name: "ExceedsImpactCap(uint256 remaining)",
    description:
      "The wallet has already used its share of the current window.",
  },
  {
    name: "LaunchNotOpen(uint256 opensAt)",
    description: "A buy arrived before launchDelay elapsed.",
  },
  {
    name: "BuyAboveRamp(uint256 max)",
    description: "The buy exceeds the size allowed at this point in buyRamp.",
  },
  {
    name: "UnknownDestination()",
    description:
      "A transfer targets an address that is neither a whitelisted pool nor an account passing the sellable-amount check.",
  },
];
