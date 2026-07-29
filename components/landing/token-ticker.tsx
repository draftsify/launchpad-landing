"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type Token = {
  name: string;
  ticker: string;
  marketCap: string;
  change: number;
  /** Part de la supply encore sous déblocage progressif */
  locked: number;
  gradient: string;
};

// Données mock — aucun backend branché à ce stade.
const TOKENS: Token[] = [
  {
    name: "Halcyon",
    ticker: "HLCN",
    marketCap: "$1.24M",
    change: 42.8,
    locked: 72,
    gradient: "from-emerald-400 to-teal-600",
  },
  {
    name: "Northwind",
    ticker: "NRTH",
    marketCap: "$860K",
    change: 12.4,
    locked: 55,
    gradient: "from-cyan-400 to-blue-600",
  },
  {
    name: "Basalt",
    ticker: "BSLT",
    marketCap: "$2.07M",
    change: -6.2,
    locked: 38,
    gradient: "from-violet-400 to-indigo-600",
  },
  {
    name: "Meridian",
    ticker: "MRDN",
    marketCap: "$418K",
    change: 88.1,
    locked: 91,
    gradient: "from-amber-400 to-orange-600",
  },
  {
    name: "Tidewater",
    ticker: "TIDE",
    marketCap: "$1.71M",
    change: -2.9,
    locked: 24,
    gradient: "from-rose-400 to-pink-600",
  },
];

function TokenCard({ token }: { token: Token }) {
  const positive = token.change >= 0;

  return (
    <article className="group w-[268px] shrink-0 snap-start rounded-xl border border-white/10 bg-surface/80 p-4 transition-colors hover:border-white/20">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-semibold text-black/80",
            token.gradient
          )}
          aria-hidden
        >
          {token.ticker.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {token.name}
          </p>
          <p className="font-mono text-xs text-subtle">${token.ticker}</p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-md px-2 py-1 font-mono text-xs font-medium",
            positive
              ? "bg-accent-soft text-accent"
              : "bg-rose-500/10 text-rose-400"
          )}
        >
          {positive ? "+" : ""}
          {token.change.toFixed(1)}%
        </span>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-xs text-subtle">Market cap</span>
        <span className="font-mono text-sm text-foreground">
          {token.marketCap}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-subtle">Supply sous déblocage</span>
          <span className="font-mono text-xs text-muted">{token.locked}%</span>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-white/10"
          role="presentation"
        >
          <div
            className="h-full rounded-full bg-accent/70"
            style={{ width: `${token.locked}%` }}
          />
        </div>
      </div>
    </article>
  );
}

export function TokenTicker() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full"
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
        </span>
        <span className="text-xs font-medium tracking-wide text-subtle uppercase">
          Lancements en cours
        </span>
      </div>

      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {TOKENS.map((token) => (
          <TokenCard key={token.ticker} token={token} />
        ))}
      </div>

      {/* Fondu latéral, purement décoratif */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-16 bg-gradient-to-l from-background to-transparent md:block"
        aria-hidden
      />
    </motion.div>
  );
}
