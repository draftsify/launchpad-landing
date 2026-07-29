"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Copy, Flame } from "lucide-react";

import { cn } from "@/lib/utils";

export type Token = {
  name: string;
  ticker: string;
  marketCap: string;
  change: number;
  address: string;
  age: string;
  /** Part de la supply encore sous déblocage progressif. */
  locked: number;
  logo: string;
  /** Profil de prix, figé : une valeur aléatoire casserait l'hydratation. */
  spark: number[];
};

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Reprise du motif en barres du hero, en miniature. */
function Sparkline({ values }: { values: number[] }) {
  return (
    <div aria-hidden className="flex h-12 items-end gap-[3px]">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-full flex-1 rounded-t-[2px] bg-linear-to-t from-foreground/70 to-foreground/15"
          style={{ height: `${Math.round(v * 100)}%` }}
        />
      ))}
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé) : on n'affiche rien.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="group/copy inline-flex items-center gap-1.5 rounded-md font-mono text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:outline-none"
      aria-label={copied ? "Address copied" : `Copy contract address ${address}`}
    >
      {shortenAddress(address)}
      {copied ? (
        <Check className="size-3" />
      ) : (
        <Copy className="size-3 opacity-60 transition-opacity group-hover/copy:opacity-100" />
      )}
    </button>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export function TokenCard({ token }: { token: Token }) {
  const positive = token.change >= 0;

  return (
    <article className="group relative overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/20">
      {/* Halo discret, ancré en haut à droite comme sur le hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-foreground/[0.06] blur-3xl"
      />

      <div className="relative flex flex-col gap-6 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/60">
              <Image
                src={token.logo}
                alt=""
                width={26}
                height={15}
                unoptimized
                className="h-4 w-auto select-none"
              />
            </span>
            <div>
              <p className="leading-tight font-medium">{token.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                ${token.ticker}
              </p>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] font-medium">
            <Flame className="size-3" />
            Trending
          </span>
        </div>

        <div className="flex items-end justify-between gap-6">
          <div className="space-y-1">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Market cap
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-medium tracking-tight tabular-nums">
                {token.marketCap}
              </span>
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
            </div>
          </div>

          <div className="hidden w-40 sm:block">
            <Sparkline values={token.spark} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Still vesting
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {token.locked}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-foreground/70"
              style={{ width: `${token.locked}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
          <Stat label="Age">{token.age}</Stat>
          <Stat label="Holders">1,284</Stat>
          <Stat label="Contract">
            <CopyAddress address={token.address} />
          </Stat>
        </div>
      </div>
    </article>
  );
}
