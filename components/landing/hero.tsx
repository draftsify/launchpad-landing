"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TokenTicker } from "@/components/landing/token-ticker";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Halo d'ambiance */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[680px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]"
        aria-hidden
      />

      <div className="mx-auto w-full max-w-6xl px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              Price Discovery Protocol
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
            className="mt-6 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl"
          >
            Le premier launchpad optimisé pour la découverte du prix
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: EASE }}
            className="mt-6 max-w-xl text-base leading-relaxed text-balance text-muted sm:text-lg"
          >
            Un protocole qui rend les marchés plus efficaces, plus équitables et
            plus durables. Les règles sont transparentes, connues à l&apos;avance,
            et une sortie raisonnable reste toujours possible.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
            className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
          >
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="#create">
                Lancer un token
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Link href="#explore">Explorer</Link>
            </Button>
          </motion.div>
        </div>

        <div className="mt-16 sm:mt-20" id="explore">
          <TokenTicker />
        </div>
      </div>
    </section>
  );
}
