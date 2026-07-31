import type { Metadata } from "next";
import Link from "next/link";

import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { BlurWords } from "@/components/site/blur-in";
import { StackRow } from "@/components/site/stack-row";
import { Mechanics } from "@/components/site/mechanics";
import { LaunchButton } from "@/components/site/launch-button";

// Défini ici et non dans mechanics.tsx : une valeur exportée par un module
// "use client" arrive au composant serveur comme référence, pas comme donnée.
const RULES = [
  {
    title: "Selling opens progressively",
    body: "A tenth is sellable from the first block, the rest unlocks steadily and everything is free after fifteen minutes. Nobody is locked in, nobody empties the pool in the first minute.",
  },
  {
    title: "Losses open the gate faster",
    body: "Drawdown raises the floor, whatever the clock says: down 20% releases about a third of a position, down 40% about three quarters, and a halved price releases all of it. It is a floor and never a bonus — being in profit costs nothing.",
  },
  {
    title: "Graduation moves nothing",
    body: "At 4.2 ETH a launch is called graduated. Same token, same pool, same locked liquidity — it is a milestone, not a migration, and not a promise.",
  },
];

export const metadata: Metadata = {
  title: "How it works — Reveal",
  description:
    "Progressive unlocking, drawdown relief and an anti-sniper ramp: the rules that make price discovery work on Reveal.",
};

const STEPS = [
  {
    title: "Describe",
    body: "A name, a symbol, an image and your links. The rules are not yours to set — they are the same for every launch, and that is what makes two tokens comparable.",
  },
  {
    title: "Launch",
    body: "One transaction deploys the token, opens its pool and arms the rules. Nobody puts up capital: the whole supply sits on one side of the range, so the buyers' ETH becomes the liquidity. You pay gas.",
  },
  {
    title: "Buy first, if you want",
    body: "A creator may take the first position inside the launch transaction, capped at 5% of the supply. It is the one advantage the protocol grants anyone, and it buys order, not exemption: those tokens unlock on exactly the same schedule as everyone else's.",
  },
  {
    title: "Discover",
    body: "Buys are recorded as positions. Sell pressure is spread over time instead of arriving all at once.",
  },
  {
    title: "Exit",
    body: "Every holder keeps a reasonable way out, at a pace the pool can absorb.",
  },
];

export default function HowItWorksPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-14 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <header className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            <BlurWords text="How Reveal works" delay={0.05} />
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Three rules, written into the contract before the first buy. The
            goal is not to stop selling, it is to stop a handful of wallets from
            deciding the price for everyone else.
          </p>
        </header>
      </section>

      <section className="relative px-4 py-10">
        <FullWidthDivider className="-top-px" />
        <Mechanics />

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {RULES.map((rule, i) => (
            <div key={rule.title} className="space-y-1.5">
              <p className="font-mono text-[11px] text-muted-foreground">
                0{i + 1}
              </p>
              <h2 className="text-sm font-medium">{rule.title}</h2>
              <p className="text-sm text-muted-foreground">{rule.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative px-4 py-12">
        <FullWidthDivider className="-top-px" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-3">
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
              From launch to exit
            </h2>
            <p className="text-sm text-muted-foreground">
              Everything after launch is automatic. No team decides who gets to
              sell — there is no admin, no pause and no whitelist anywhere in the
              contracts.
            </p>
          </div>

          <ol className="relative list-none space-y-6 border-l pl-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <span
                  aria-hidden
                  className="absolute top-1 -left-[31px] flex size-3 items-center justify-center rounded-full border bg-background"
                >
                  <span className="size-1 rounded-full bg-foreground" />
                </span>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  Step {i + 1}
                </p>
                <p className="mt-0.5 font-medium">{step.title}</p>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="relative">
        <FullWidthDivider className="-top-px" />
        <StackRow />
      </section>

      <section className="relative px-4 py-14 text-center">
        <FullWidthDivider className="-top-px" />
        <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Ready to launch on these rules?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The same rules for every token, yours included. You pay gas.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LaunchButton />
          <Button variant="card" asChild>
            <Link href="/launchpad">See tokens</Link>
          </Button>
        </div>
        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
