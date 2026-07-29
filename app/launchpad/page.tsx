import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { BlurWords } from "@/components/site/blur-in";
import { TokenBrowser } from "@/components/site/token-browser";
import { TOKENS } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Launchpad — Reveal",
  description:
    "Every token launched on Reveal, with its unlock schedule and live price discovery.",
};

export default function LaunchpadPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-20 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
              <BlurWords text="Launchpad" delay={0.05} />
            </h1>
            <p className="max-w-lg text-sm text-muted-foreground sm:text-base">
              Every token launched on Reveal, with its unlock schedule and live
              price discovery.
            </p>
          </div>

          <Button asChild>
            <Link href="/create">
              Launch a token
              <ArrowRight />
            </Link>
          </Button>
        </header>

        <TokenBrowser tokens={TOKENS} />

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
