import type { Metadata } from "next";

import { Shell } from "@/components/site/shell";
import { FullWidthDivider } from "@/components/full-width-divider";
import { BlurWords } from "@/components/site/blur-in";
import { AnalyticsDashboard } from "@/components/site/analytics-dashboard";

export const metadata: Metadata = {
  title: "Analytics — Reveal",
  description:
    "Liquidity, market cap and token deployments across the Reveal launchpad, read live from the chain.",
};

export default function AnalyticsPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-16 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <header className="mb-6 max-w-2xl space-y-2">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            <BlurWords text="Protocol analytics" delay={0.05} />
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Summed across every token in the launcher&rsquo;s registry, read from
            the chain at each refresh.
          </p>
        </header>

        <AnalyticsDashboard />

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
