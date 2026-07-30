"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Coins, Loader2, TriangleAlert } from "lucide-react";

import { activeChain, isDeployed } from "@/lib/chain";
import { dailyLaunches, statsFrom } from "@/lib/analytics";
import { BarChart } from "@/components/site/bar-chart";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/site/count-up";
import { useLaunches } from "@/components/site/use-launches";

function Frame({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border bg-card">
        {icon}
      </span>
      {children}
    </div>
  );
}

export function AnalyticsDashboard() {
  const { data: launches, loading, error } = useLaunches();

  // Le temps entre dans le calcul (fenêtre de 24 h, axe des jours) : il est lu
  // une fois par rendu, à côté des données qu'il date.
  const { stats, series } = useMemo(() => {
    const now = Date.now();
    return {
      stats: statsFrom(launches, now),
      series: dailyLaunches(launches, now),
    };
  }, [launches]);

  if (!isDeployed) {
    return (
      <Frame icon={<Coins className="size-5 text-muted-foreground" />}>
        <div className="space-y-1">
          <p className="font-medium">No launcher deployed yet</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Every figure on this page is summed from the RevealLauncher registry
            on {activeChain.name}. None is deployed, so there is nothing to sum.
          </p>
        </div>
      </Frame>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Reading {activeChain.name}…
      </div>
    );
  }

  if (error) {
    return (
      <Frame icon={<TriangleAlert className="size-5 text-muted-foreground" />}>
        <div className="space-y-1">
          <p className="font-medium">The node did not answer</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            These numbers are zero because nothing could be read, not because
            nothing has happened. {error}
          </p>
        </div>
      </Frame>
    );
  }

  if (launches.length === 0) {
    return (
      <Frame icon={<Coins className="size-5 text-muted-foreground" />}>
        <div className="space-y-1">
          <p className="font-medium">No token has launched yet</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            The launcher is live and its registry is empty. There is nothing to
            measure until something launches.
          </p>
        </div>
        <Button variant="card" asChild>
          <Link href="/create">
            Launch a token
            <ArrowRight />
          </Link>
        </Button>
      </Frame>
    );
  }

  const [hero, ...rest] = stats;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-3 sm:divide-x sm:divide-border">
          <div className="sm:pr-6">
            <p className="text-sm text-muted-foreground">{hero.label}</p>
            {/* Chiffre-phare : un seul par vue, en chiffres proportionnels. */}
            <p className="mt-1 text-5xl font-medium tracking-tight">
              <CountUp value={hero.value} format={hero.format} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{hero.hint}</p>
          </div>

          {rest.map((stat, i) => (
            <div key={stat.label} className="sm:pl-6">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-3xl font-medium tracking-tight">
                <CountUp
                  value={stat.value}
                  format={stat.format}
                  delay={0.1 + i * 0.1}
                />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
            </div>
          ))}
        </div>

        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          Read from {activeChain.name} across{" "}
          {launches.length === 1 ? "1 pool" : `${launches.length} pools`}, live.
          Amounts are in the quote asset the pools are denominated in — no price
          oracle is involved.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title="Token launches"
          subtitle="Per day, from each token's recorded launch time."
          data={series}
          format={(v) => Math.round(v).toString()}
          integer
        />

        {/* La seconde moitié de la grille portait un volume quotidien inventé.
            Ce qui la remplit maintenant est la raison pour laquelle elle est
            vide : nommer ce qui manque vaut mieux que tracer un zéro. */}
        <section className="flex flex-col justify-center gap-3 rounded-2xl border border-dashed bg-card/40 p-5">
          <h3 className="font-medium">Volume, trades and holders</h3>
          <p className="text-sm text-muted-foreground">
            These are not on this page because a node cannot answer them. A swap
            leaves a log, not a balance: totalling volume, counting trades or
            listing holders means replaying every event the pools have ever
            emitted, and keeping that tally somewhere.
          </p>
          <p className="text-sm text-muted-foreground">
            That is an indexer, and Reveal does not run one yet. Until it does,
            these charts would be guesses — so they are absent rather than
            approximate.
          </p>
        </section>
      </div>
    </div>
  );
}
