"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Copy, Flame } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import type { Token } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
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

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export function TokenCard({ token, index = 0 }: { token: Token; index?: number }) {
  const reduce = useReducedMotion();
  const positive = token.change >= 0;

  return (
    <motion.article
      initial={reduce ? undefined : { opacity: 0, y: 14 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: EASE }}
      className="group relative overflow-hidden rounded-2xl border bg-card transition-colors duration-300 hover:border-foreground/25"
    >
      {/* Halo qui se révèle au survol, ancré derrière le logo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-10 size-56 rounded-full bg-foreground/[0.05] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex flex-col gap-6 p-5 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl border bg-muted/50 transition-transform duration-300 group-hover:scale-[1.03] sm:size-24">
            <Image
              src={token.logo}
              alt=""
              width={512}
              height={287}
              className="h-9 w-auto select-none sm:h-11"
            />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg leading-tight font-medium">
                  {token.name}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  ${token.ticker}
                </p>
              </div>

              {token.trending && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] font-medium">
                  <Flame className="size-3" />
                  Trending
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              {/* Chiffres proportionnels : tabular-nums donne à chaque chiffre
                  la largeur d'un 0, ce qui délave un grand nombre. */}
              <span className="text-3xl font-medium tracking-tight sm:text-4xl">
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
            <p className="-mt-2 text-[11px] tracking-wide text-muted-foreground uppercase">
              Market cap
            </p>
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
            <motion.div
              className="h-full rounded-full bg-foreground/70"
              initial={reduce ? undefined : { width: 0 }}
              whileInView={reduce ? undefined : { width: `${token.locked}%` }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 1.1, delay: 0.25, ease: EASE }}
              style={reduce ? { width: `${token.locked}%` } : undefined}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
          <Stat label="Age">{token.age}</Stat>
          <Stat label="Holders">{token.holders}</Stat>
          <Stat label="Contract">
            <CopyAddress address={token.address} />
          </Stat>
        </div>
      </div>
    </motion.article>
  );
}
