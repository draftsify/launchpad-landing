import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HeroBars } from "@/components/site/hero-bars";

export function Hero() {
  return (
    <section className="relative w-full border-b px-4 pt-32 pb-48 sm:pt-36 sm:pb-54">
      <div
        aria-hidden
        className="absolute inset-0 isolate hidden overflow-hidden lg:block"
      >
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(35%_80%_at_49%_45%,--theme(--color-foreground/.05),transparent)]" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center justify-center gap-5">
        <Link
          href="#protocole"
          className="group flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-xs transition-colors hover:bg-muted active:scale-98"
        >
          <Sparkles className="size-3" />
          <span aria-hidden className="block h-4 border-l" />
          <span className="text-xs">Déblocage progressif natif</span>
          <span aria-hidden className="block h-4 border-l" />
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <h1 className="text-center text-4xl tracking-tight text-balance [text-shadow:0_0_50px_--theme(--color-foreground/.2)] md:text-5xl lg:text-6xl">
          Le launchpad optimisé pour la découverte du prix
        </h1>

        <p className="mx-auto max-w-lg text-center text-sm tracking-wide text-foreground/80 sm:text-lg">
          Des marchés plus efficaces, plus équitables et plus durables. Les
          règles sont connues à l&apos;avance, et une sortie raisonnable reste
          toujours possible.
        </p>

        <div className="flex flex-row flex-wrap items-center justify-center gap-3 pt-2">
          <Button variant="card" size="lg" asChild>
            <Link href="#demo">
              <Play />
              Voir la démo
            </Link>
          </Button>
          <Button size="lg" asChild>
            <Link href="#create">
              Lancer un token
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      <HeroBars />

      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-px left-1/2 h-px w-screen -translate-x-1/2 bg-border"
      />
    </section>
  );
}
