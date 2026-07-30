"use client";

import { useState } from "react";

import {
  SERIES,
  formatCount,
  formatUsd,
  getStats,
  type Range,
} from "@/lib/analytics";
import { BarChart } from "@/components/site/bar-chart";
import { CountUp } from "@/components/site/count-up";
import { cn } from "@/lib/utils";

const RANGES: { id: Range; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "all", label: "All time" },
];

export function AnalyticsDashboard() {
  const [range, setRange] = useState<Range>("24h");
  const stats = getStats(range);
  const [hero, ...rest] = stats;
  const empty = SERIES.volume.length === 0 && SERIES.launches.length === 0;

  return (
    <div className="space-y-4">
      {/* Un seul rang de filtres, au-dessus de tout ce qu'il gouverne. */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Time range"
          className="inline-flex items-center rounded-full border bg-card p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                "h-7 rounded-full px-3 text-sm transition-colors",
                range === r.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-3 sm:divide-x sm:divide-border">
          <div className="sm:pr-6">
            <p className="text-sm text-muted-foreground">{hero.label}</p>
            {/* Chiffre-phare : chiffres proportionnels, un seul par vue. */}
            <p className="mt-1 text-5xl font-medium tracking-tight">
              <CountUp
                key={`${range}-${hero.label}`}
                value={hero.value}
                format={hero.kind === "usd" ? formatUsd : formatCount}
              />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hero.delta ? `${hero.delta} ${hero.hint}` : hero.hint}
            </p>
          </div>

          {rest.map((stat, i) => (
            <div key={stat.label} className="sm:pl-6">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-3xl font-medium tracking-tight">
                <CountUp
                  key={`${range}-${stat.label}`}
                  value={stat.value}
                  format={stat.kind === "usd" ? formatUsd : formatCount}
                  delay={0.1 + i * 0.1}
                />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stat.delta ? `${stat.delta} ${stat.hint}` : stat.hint}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          Zero because nothing has launched yet — not a placeholder.
        </p>
      </div>

      {/* Une série vide ne se trace pas. Plutôt qu'un cadre d'axes sans
          barres, on nomme ce qui manque : un indexeur, pas des données. */}
      {empty ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/40 px-6 py-16 text-center">
          <p className="font-medium">Nothing to chart yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Daily volume and launch counts are history, and a node only answers
            the present. These charts fill in once tokens launch and an indexer
            records the swaps.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <BarChart
            title="Trading volume"
            subtitle="Daily context, latest complete day highlighted."
            data={SERIES.volume}
            format={formatUsd}
          />
          <BarChart
            title="Token launches"
            subtitle="Daily context, latest complete day highlighted."
            data={SERIES.launches}
            format={(v) => formatCount(Math.round(v))}
            integer
          />
        </div>
      )}
    </div>
  );
}
