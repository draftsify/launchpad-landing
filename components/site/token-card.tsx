"use client";

import Link from "next/link";
import { ArrowUpRight, Flame } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import type { Token } from "@/lib/tokens";
import { formatUsd } from "@/lib/format";
import { CopyAddress } from "@/components/site/copy-address";
import { CountUp } from "@/components/site/count-up";
import { TokenMark } from "@/components/site/token-mark";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

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
      // `layout` fait glisser la carte quand le tri change, au lieu de la
      // téléporter : c'est ce qui rend le changement d'ordre lisible.
      layout
      initial={reduce ? undefined : { opacity: 0, y: 14 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, scale: 0.97 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{
        duration: 0.6,
        delay: index * 0.08,
        ease: EASE,
        layout: { duration: 0.45, delay: 0, ease: EASE },
      }}
      className="group relative overflow-hidden rounded-2xl border bg-card transition-colors duration-300 hover:border-foreground/25"
    >
      {/* Halo qui se révèle au survol, ancré derrière le logo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-10 size-56 rounded-full bg-foreground/[0.05] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex flex-col gap-6 p-5 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          <TokenMark
            token={token}
            className="transition-transform duration-300 group-hover:scale-[1.03]"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-lg leading-tight font-medium">
                  <span className="truncate">{token.name}</span>
                  {/* Affordance du lien : la carte entière est cliquable. */}
                  <ArrowUpRight
                    aria-hidden
                    className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:text-foreground group-hover:opacity-100"
                  />
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
              <CountUp
                value={token.marketCapValue}
                format={formatUsd}
                delay={0.15}
                className="text-3xl font-medium tracking-tight sm:text-4xl"
              />
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
            {/* Au-dessus du calque de lien, sinon copier navigue. */}
            <span className="relative z-20">
              <CopyAddress address={token.address} />
            </span>
          </Stat>
        </div>
      </div>

      {/* Lien étalé plutôt qu'un <a> englobant : la carte contient déjà un
          bouton (copier), qu'on ne peut pas imbriquer dans un lien. */}
      <Link
        href={`/token/${token.slug}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
      >
        <span className="sr-only">
          View {token.name} (${token.ticker})
        </span>
      </Link>
    </motion.article>
  );
}
