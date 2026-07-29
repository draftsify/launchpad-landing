"use client";

import { BarChart } from "@/components/site/bar-chart";
import { CountUp } from "@/components/site/count-up";
import { TokenPosition } from "@/components/site/token-position";
import { formatUsd } from "@/lib/format";
import type { Token } from "@/lib/tokens";
import { cn } from "@/lib/utils";

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 px-4 py-3 sm:px-5">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="text-lg font-medium tracking-tight">{children}</div>
    </div>
  );
}

/**
 * Client : `CountUp` et `BarChart` reçoivent une fonction de formatage, qui ne
 * peut pas traverser la frontière serveur → client.
 */
export function TokenOverview({ token }: { token: Token }) {
  const positive = token.change >= 0;

  return (
    <>
      <div className="mt-8 grid divide-y rounded-2xl border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
        <Stat label="Market cap">
          <span className="flex items-baseline gap-2">
            <CountUp value={token.marketCapValue} format={formatUsd} />
            {/* En monochrome, la direction passe par la flèche. */}
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                positive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span aria-hidden>{positive ? "↑" : "↓"}</span>
              {Math.abs(token.change).toFixed(1)}%
              <span className="sr-only">
                {positive ? "up" : "down"} over 24 hours
              </span>
            </span>
          </span>
        </Stat>
        <Stat label="Holders">{token.holders}</Stat>
        <Stat label="Liquidity">{token.liquidity}</Stat>
        <Stat label="Age">{token.age}</Stat>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(0,340px)]">
        <BarChart
          title="Trading volume"
          subtitle="Daily context, latest complete day highlighted."
          data={token.volume}
          format={formatUsd}
        />
        <TokenPosition ticker={token.ticker} rules={token.rules} />
      </div>
    </>
  );
}
