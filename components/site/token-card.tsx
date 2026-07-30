"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { formatAge, formatEth } from "@/lib/format";
import { slugOf, type Launch } from "@/lib/onchain";
import { CopyAddress } from "@/components/site/copy-address";
import { TokenMark } from "@/components/site/token-mark";

const EASE = [0.16, 1, 0.3, 1] as const;

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

/**
 * Une carte ne montre que ce que la chaîne rend.
 *
 * Elle portait avant une variation sur 24 h, un nombre de détenteurs et une
 * barre de supply restant à débloquer. Les trois demandent un indexeur : un
 * nœud ne connaît ni le prix d'hier, ni l'historique des transferts, ni
 * l'ensemble des positions. À la place, la liquidité — qui est le chiffre le
 * plus parlant ici, puisqu'elle part de zéro et ne vient que des acheteurs.
 */
export function TokenCard({ launch, index = 0 }: { launch: Launch; index?: number }) {
  const reduce = useReducedMotion();

  return (
    <motion.article
      layout
      initial={reduce ? undefined : { opacity: 0, y: 14 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{
        duration: 0.6,
        delay: Math.min(index, 6) * 0.06,
        ease: EASE,
        layout: { duration: 0.45, delay: 0, ease: EASE },
      }}
      className="group relative overflow-hidden rounded-2xl border bg-card transition-colors duration-300 hover:border-foreground/25"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-10 size-56 rounded-full bg-foreground/[0.05] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex flex-col gap-6 p-5 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          <TokenMark
            symbol={launch.symbol}
            image={launch.meta?.image}
            className="transition-transform duration-300 group-hover:scale-[1.03]"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-lg leading-tight font-medium">
                <span className="truncate">{launch.name}</span>
                <ArrowUpRight
                  aria-hidden
                  className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:text-foreground group-hover:opacity-100"
                />
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                ${launch.symbol}
              </p>
            </div>

            <div>
              <p className="text-3xl font-medium tracking-tight tabular-nums sm:text-4xl">
                {formatEth(launch.marketCapEth)}
              </p>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Market cap
              </p>
            </div>
          </div>
        </div>

        {launch.meta?.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {launch.meta.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
          <Stat label="Liquidity">{formatEth(launch.liquidityEth)}</Stat>
          <Stat label="Age">{formatAge(launch.launchedAt)}</Stat>
          <Stat label="Contract">
            {/* Au-dessus du calque de lien, sinon copier navigue. */}
            <span className="relative z-20">
              <CopyAddress address={launch.address} />
            </span>
          </Stat>
        </div>
      </div>

      {/* Lien étalé plutôt qu'un <a> englobant : la carte contient déjà un
          bouton (copier), qu'on ne peut pas imbriquer dans un lien. */}
      <Link
        href={`/token/${slugOf(launch)}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
      >
        <span className="sr-only">
          View {launch.name} (${launch.symbol})
        </span>
      </Link>
    </motion.article>
  );
}
