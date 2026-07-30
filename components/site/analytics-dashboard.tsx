"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Coins, Loader2, TriangleAlert } from "lucide-react";

import { activeChain, isDeployed } from "@/lib/chain";
import { dailyLaunches, statsFrom } from "@/lib/analytics";
import { formatEth } from "@/lib/format";
import { BarChart } from "@/components/site/bar-chart";
import { useProtocolActivity } from "@/components/site/use-activity";
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
  // Volume et trades ne sont pas des états : ils viennent des journaux.
  const activity = useProtocolActivity();

  /** Un tiret tant que la relecture n'a rien rendu — pas un zéro. */
  const traded = (read: (a: NonNullable<typeof activity.data>) => string) =>
    activity.data ? read(activity.data) : "—";

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

      {/* Seconde rangée : ce que les journaux disent, et non l'état. Elle a
          longtemps affiché trois zéros faute d'indexeur ; ils sont maintenant
          relus swap par swap, dans chaque pool du registre. */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-3 sm:divide-x sm:divide-border">
          {[
            ["24h volume", traded((a) => formatEth(a.volume24h))],
            ["Total volume", traded((a) => formatEth(a.volumeTotal))],
            [
              "Trades",
              traded((a) => `${a.trades.toLocaleString("en-US")} (${a.trades24h} in 24h)`),
            ],
          ].map(([label, value]) => (
            <div key={label} className="sm:not-first:pl-6 sm:not-last:pr-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-medium tracking-tight tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          {activity.error
            ? `The swap history could not be read — this is not zero activity. ${activity.error}`
            : activity.loading
              ? "Replaying every pool's swaps…"
              : `Replayed from the Swap logs of ${
                  activity.data?.pools === 1 ? "1 pool" : `${activity.data?.pools ?? 0} pools`
                }, cached for a minute.`}
        </p>
      </div>

      <BarChart
        title="Token launches"
        subtitle="Per day, from each token's recorded launch time."
        data={series}
        format={(v) => Math.round(v).toString()}
        integer
      />
    </div>
  );
}
