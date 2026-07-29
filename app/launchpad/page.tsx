import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Coins, Search } from "lucide-react";

import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { TokenCard, type Token } from "@/components/site/token-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Launchpad — Reveal",
  description:
    "Every token launched on Reveal, with its unlock schedule and live price discovery.",
};

// Onglets encore inertes : la donnée n'est pas branchée.
const FILTERS = ["Recent", "Trending", "Market cap", "Ending soon"];

const TRENDING: Token = {
  name: "Reveal",
  ticker: "REVEAL",
  marketCap: "$1.2M",
  change: 42.8,
  address: "0x7A3F9c21E4b8D5a06fC1e7B2d93aC48e5F0b1d62",
  age: "3d 14h",
  locked: 62,
  logo: "/logo.png",
  spark: [
    0.28, 0.34, 0.3, 0.42, 0.38, 0.52, 0.47, 0.61, 0.55, 0.68, 0.72, 0.64, 0.78,
    0.71, 0.85, 0.92, 0.81, 1,
  ],
};

export default function LaunchpadPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-20 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Launchpad
            </h1>
            <p className="max-w-lg text-sm text-muted-foreground sm:text-base">
              Every token launched on Reveal, with its unlock schedule and live
              price discovery.
            </p>
          </div>

          <Button asChild>
            <Link href="/#create">
              Launch a token
              <ArrowRight />
            </Link>
          </Button>
        </header>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Sort tokens"
            className="flex flex-wrap items-center gap-1"
          >
            {FILTERS.map((filter, i) => (
              <button
                key={filter}
                type="button"
                role="tab"
                aria-selected={i === 0}
                className={cn(
                  "h-8 rounded-full px-3 text-sm transition-colors",
                  i === 0
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="relative sm:w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              placeholder="Search by name or ticker"
              aria-label="Search tokens"
              className="h-9 w-full rounded-full border bg-card pr-3 pl-9 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/20"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <TokenCard token={TRENDING} />

          {/* Un seul lancement pour l'instant : l'emplacement libre l'annonce
              plutôt que de laisser une colonne vide. */}
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-14 text-center">
            <span className="flex size-11 items-center justify-center rounded-full border bg-card">
              <Coins className="size-5 text-muted-foreground" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Your token here</p>
              <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                Set your unlock curve and anti-sniper rules, then launch.
              </p>
            </div>
            <Button variant="card" asChild>
              <Link href="/#create">
                Launch a token
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
