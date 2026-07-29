import type { Metadata } from "next";

import { Shell } from "@/components/site/shell";
import { FullWidthDivider } from "@/components/full-width-divider";
import { AnalyticsDashboard } from "@/components/site/analytics-dashboard";

export const metadata: Metadata = {
  title: "Analytics — Reveal",
  description:
    "Volume, token deployments and trading activity across the Reveal launchpad.",
};

export default function AnalyticsPage() {
  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-16 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <header className="mb-6 max-w-2xl space-y-2">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            Protocol analytics
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Volume, deployments and trading activity across every token launched
            on Reveal.
          </p>
        </header>

        <AnalyticsDashboard />

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
