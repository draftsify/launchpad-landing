import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { BlurWords } from "@/components/site/blur-in";
import { StackRow } from "@/components/site/stack-row";
import { Mechanics } from "@/components/site/mechanics";

export const metadata: Metadata = {
  title: "How it works — Reveal",
  description:
    "Progressive unlocking, loss protection and impact caps: the three rules that make price discovery work on Reveal.",
};

const STEPS = [
  {
    title: "Configure",
    body: "Set unlock duration, initial sellable share, drawdown thresholds, impact caps and anti-sniper rules.",
  },
  {
    title: "Launch",
    body: "The token deploys with those rules written into the contract. They are public before the first buy.",
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

      <section className="relative px-4 py-12">
        <FullWidthDivider className="-top-px" />
        <p className="mb-5 text-sm text-muted-foreground">
          Hover or focus a value to see the rule recompute.
        </p>
        <Mechanics />
      </section>

      <section className="relative px-4 py-12">
        <FullWidthDivider className="-top-px" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-3">
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
              From configuration to exit
            </h2>
            <p className="text-sm text-muted-foreground">
              Everything after launch is automatic. No team decides who gets to
              sell.
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
          Every parameter is yours to set at creation.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/#create">
              Launch a token
              <ArrowRight />
            </Link>
          </Button>
          <Button variant="card" asChild>
            <Link href="/launchpad">See tokens</Link>
          </Button>
        </div>
        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
