import type { Metadata } from "next";
import Link from "next/link";

import { Shell } from "@/components/site/shell";
import { FullWidthDivider } from "@/components/full-width-divider";
import { BlurWords } from "@/components/site/blur-in";
import { CreateForm } from "@/components/site/create-form";

export const metadata: Metadata = {
  title: "Launch a token — Reveal",
  description:
    "Name it, add an image, launch. Supply, liquidity and the selling rules are the protocol's and identical for everyone; you pay gas.",
};

export default function CreatePage() {
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
