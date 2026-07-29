import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";

export const metadata: Metadata = {
  title: "Docs — Reveal",
  description:
    "Reference for Reveal: core concepts, launch parameters, position accounting and integration notes.",
};

type Param = {
  name: string;
  type: string;
  range: string;
  description: string;
};

const PARAMS: Param[] = [
  {
    name: "initialUnlock",
    type: "uint16",
    range: "0 – 10000 bps",
    description:
      "Share of a position sellable the moment it is bought. Set it too low and holders feel trapped.",
  },
  {
    name: "unlockDuration",
    type: "uint32",
    range: "1h – 30d",
    description:
      "Time for a position to reach fully sellable, before any size or drawdown adjustment.",
  },
  {
    name: "sizePenalty",
    type: "uint16",
    range: "0 – 10000 bps",
    description:
      "How much a position's share of liquidity stretches its own unlock duration. Whales wait longer.",
  },
  {
    name: "drawdownRelief",
    type: "uint16[]",
    range: "up to 4 tiers",
    description:
      "Loss thresholds that raise the sellable share. A position down 40% approaches fully liquid.",
  },
  {
    name: "impactCap",
    type: "uint16",
    range: "10 – 2000 bps",
    description:
      "Maximum share of pool liquidity one wallet may move within a window.",
  },
  {
    name: "impactWindow",
    type: "uint32",
    range: "1m – 1h",
    description: "Rolling window over which impactCap is measured.",
  },
  {
    name: "launchDelay",
    type: "uint32",
    range: "0 – 10m",
    description:
      "Seconds after deployment before the first buy is accepted. Blocks same-block sniping.",
  },
  {
    name: "buyRamp",
    type: "uint32",
    range: "0 – 30m",
    description:
      "Period during which the maximum buy size grows from a floor to unlimited.",
  },
];

const CONCEPTS = [
  {
    id: "positions",
    title: "Positions, not balances",
    body: [
      "Every buy creates a position recording the owner, amount, entry price, timestamp, amount already sold, and pool liquidity at the time of purchase.",
      "Selling limits are computed per position, not per wallet balance. Two buys made hours apart unlock on their own schedules.",
    ],
  },
  {
    id: "sellable",
    title: "Computing the sellable amount",
    body: [
      "At any moment the contract derives a maximum sellable amount from three inputs: elapsed time against unlockDuration, the position's size relative to liquidity at entry, and its current drawdown.",
      "The result is capped again by impactCap over impactWindow. A transaction exceeding the limit reverts; the remainder stays available later.",
    ],
  },
  {
    id: "enforcement",
    title: "Where the rules live",
    body: [
      "Limits are enforced in the token's transfer hook, not only in the router. Without that, moving tokens to a second wallet or trading on another pool would bypass everything.",
      "Pools created by the launchpad are whitelisted. Transfers to unknown addresses follow the same sellable-amount check as a sale.",
    ],
  },
  {
    id: "pricing",
    title: "Reading the price",
    body: [
      "Drawdown relief uses a time-weighted average, never the spot price. A spot read would let anyone crash the price for one block to unlock their whole position, then sell into the recovery.",
    ],
  },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-16 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr]">
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="space-y-2">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                Docs
              </h1>
              <p className="text-sm text-muted-foreground">
                How the protocol behaves, and every knob you can turn.
              </p>
            </div>

            <nav aria-label="Sections" className="hidden lg:block">
              <ul className="space-y-1.5 border-l pl-4">
                {[
                  { id: "start", label: "Getting started" },
                  ...CONCEPTS.map((c) => ({ id: c.id, label: c.title })),
                  { id: "parameters", label: "Launch parameters" },
                  { id: "limits", label: "Known limits" },
                ].map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="max-w-2xl space-y-10">
            <Section id="start" title="Getting started">
              <p className="text-sm text-muted-foreground">
                A launch on Reveal is one transaction. You pick a name, supply
                and initial liquidity, then set the selling rules below. Once
                deployed the parameters are immutable and publicly readable —
                that is the point, buyers can check them before the first block.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button asChild size="sm">
                  <Link href="/#create">
                    Launch a token
                    <ArrowRight />
                  </Link>
                </Button>
                <Button variant="card" size="sm" asChild>
                  <Link href="/how-it-works">See the mechanics</Link>
                </Button>
              </div>
            </Section>

            {CONCEPTS.map((concept) => (
              <Section
                key={concept.id}
                id={concept.id}
                title={concept.title}
              >
                {concept.body.map((p, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {p}
                  </p>
                ))}
              </Section>
            ))}

            <Section id="parameters" title="Launch parameters">
              <p className="text-sm text-muted-foreground">
                All values are set at creation and cannot be changed afterwards.
                Basis points, so 10000 bps equals 100%.
              </p>

              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Parameter</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PARAMS.map((param) => (
                      <tr
                        key={param.name}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-4 py-3 align-top">
                          <span className="font-mono text-xs">
                            {param.name}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {param.description}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                          {param.type}
                        </td>
                        <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                          {param.range}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="limits" title="Known limits">
              <p className="text-sm text-muted-foreground">
                Reveal reduces the damage a few wallets can do; it does not make
                a launch safe. Splitting funds across many wallets before buying
                still bypasses per-position sizing — the aim is to make that
                costly, not impossible.
              </p>
              <p className="text-sm text-muted-foreground">
                MEV is reduced, never eliminated. Ordering ultimately belongs to
                the sequencer, not to this protocol.
              </p>
            </Section>

            <p className="border-t pt-6 text-xs text-muted-foreground">
              This documentation describes intended behaviour for a protocol
              still in development. Parameter names and ranges will move before
              audit.
            </p>
          </div>
        </div>

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
