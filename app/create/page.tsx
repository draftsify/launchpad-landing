import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

import { activeChain } from "@/lib/chain";
import { launchesOpen } from "@/lib/launch-gate";
import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { BlurWords } from "@/components/site/blur-in";
import { CreateForm } from "@/components/site/create-form";

export const metadata: Metadata = {
  title: "Launch a token — Reveal",
  description:
    "Name it, add an image, launch. Supply, liquidity and the selling rules are the protocol's and identical for everyone; you pay gas.",
};

export default function CreatePage() {
  /**
   * La porte, et non un simple bouton grisé ailleurs.
   *
   * Les boutons du site passent tous par `LaunchButton`, mais rien n'empêche
   * d'arriver ici par l'URL, un lien partagé ou un signet. Cacher l'entrée sans
   * fermer la pièce ne ferme rien.
   */
  if (!launchesOpen) {
    return (
      <Shell>
        <section className="relative px-4 pt-8 pb-24 sm:pt-10">
          <FullWidthDivider className="-top-px" />

          <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-20 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border bg-card">
              <Lock className="size-5 text-muted-foreground" />
            </span>

            <div className="space-y-3">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                <BlurWords text="Reveal hasn't launched yet" delay={0.05} />
              </h1>
              <p className="text-sm text-balance text-muted-foreground sm:text-base">
                Token creation is not open. The contracts are written and
                tested, but nothing has been deployed to {activeChain.name}, so
                there is no launcher to create anything with.
              </p>
              <p className="text-sm text-balance text-muted-foreground">
                Everything else works and is worth reading first — the rules
                every launch will obey are already fixed, and published.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/how-it-works">How it works</Link>
              </Button>
              <Button variant="card" asChild>
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>

          <FullWidthDivider className="-bottom-px" />
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-20 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <header className="mb-10 max-w-2xl space-y-2">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            <BlurWords text="Launch a token" delay={0.05} />
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Name, image, links. Supply, liquidity and the selling rules are the
            same for every launch — what you write here goes on chain and is
            readable by buyers before the first block —{" "}
            <Link
              href="/how-it-works"
              className="text-foreground underline-offset-4 hover:underline"
            >
              see what each rule does
            </Link>
            .
          </p>
        </header>

        <CreateForm />

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
