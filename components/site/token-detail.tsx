"use client";

import Link from "next/link";
import { ArrowLeft, Globe, Loader2, Send, TriangleAlert } from "lucide-react";

import { activeChain, explorerAddress, isDeployed } from "@/lib/chain";
import { formatAge, formatEth, formatTokens } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CopyAddress } from "@/components/site/copy-address";
import { FullWidthDivider } from "@/components/full-width-divider";
import { TokenMark } from "@/components/site/token-mark";
import { TradePanel } from "@/components/site/trade-panel";
import { useLaunch } from "@/components/site/use-launches";
import { useRules } from "@/components/site/use-rules";
import { XIcon } from "@/components/x-icon";
import { formatEther } from "viem";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative px-4 pt-8 pb-16 sm:pt-10">
      <FullWidthDivider className="-top-px" />
      <Link
        href="/launchpad"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All launches
      </Link>
      {children}
      <FullWidthDivider className="-bottom-px" />
    </section>
  );
}

export function TokenDetail({ slug }: { slug: string }) {
  const { data: launch, loading, error, reload } = useLaunch(slug);
  // Les règles affichées sont celles que le launcher applique, pas une copie.
  const rules = useRules();

  if (!isDeployed || error || (!loading && !launch)) {
    return (
      <Frame>
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-20 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border bg-card">
            <TriangleAlert className="size-5 text-muted-foreground" />
          </span>
          <p className="font-medium">
            {!isDeployed
              ? "No launcher deployed yet"
              : error
                ? "The node did not answer"
                : "No token at this address"}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {!isDeployed
              ? `This page reads a token contract on ${activeChain.name}. None exists yet.`
              : error
                ? `This is a connection problem, not a missing token. ${error}`
                : `Nothing on ${activeChain.name} answers as a Reveal token here. Check the address.`}
          </p>
          <Button variant="card" asChild>
            <Link href="/launchpad">Browse launches</Link>
          </Button>
        </div>
      </Frame>
    );
  }

  if (loading || !launch) {
    return (
      <Frame>
        <div className="mt-10 flex items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Reading {activeChain.name}…
        </div>
      </Frame>
    );
  }

  const meta = launch.meta;
  const links = [
    meta?.website && {
      label: meta.website,
      href: `https://${meta.website.replace(/^https?:\/\//, "")}`,
      icon: <Globe />,
    },
    meta?.x && { label: `@${meta.x}`, href: `https://x.com/${meta.x}`, icon: <XIcon /> },
    meta?.telegram && {
      label: `t.me/${meta.telegram}`,
      href: `https://t.me/${meta.telegram}`,
      icon: <Send />,
    },
  ].filter(Boolean) as { label: string; href: string; icon: React.ReactNode }[];

  const explorer = explorerAddress(launch.address);

  return (
    <Frame>
      <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4 sm:gap-5">
          <TokenMark symbol={launch.symbol} image={meta?.image} />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                {launch.name}
              </h1>
              <span className="font-mono text-sm text-muted-foreground">
                ${launch.symbol}
              </span>
            </div>

            {meta?.description && (
              <p className="max-w-xl text-sm text-muted-foreground">
                {meta.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              <CopyAddress address={launch.address} />
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3"
                >
                  {link.icon}
                  {link.label}
                </a>
              ))}
              {explorer && (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Explorer
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mt-8 grid divide-y rounded-2xl border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
        {[
          ["Market cap", formatEth(launch.marketCapEth)],
          ["Liquidity", formatEth(launch.liquidityEth)],
          ["Price", formatEth(launch.priceEth)],
          ["Age", formatAge(launch.launchedAt)],
        ].map(([label, value]) => (
          <div key={label} className="space-y-1 px-4 py-3 sm:px-5">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              {label}
            </p>
            <p className="text-lg font-medium tracking-tight tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="space-y-4">
          {/* Un nœud répond l'état présent, pas le prix d'hier : un historique
              demande un indexeur qui enregistre chaque swap. Tant qu'il n'existe
              pas, on le dit — une courbe reconstituée serait une invention. */}
          <section className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/40 p-6 text-center">
            <p className="font-medium">Price history isn&apos;t indexed yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Everything above is read live from the pool. A chart needs
              yesterday&apos;s price, which a node cannot answer — that takes an
              indexer, and it isn&apos;t running.
            </p>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-medium">Launch rules</h2>
                <p className="text-sm text-muted-foreground">
                  Written into the contract before the first buy, identical for
                  every launch. Nobody can change them.
                </p>
              </div>
              <Button variant="card" size="sm" asChild>
                <Link href="/how-it-works">What these mean</Link>
              </Button>
            </div>

            <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Sellable at launch", `${rules.initialUnlock}%`],
                ["Fully unlocked after", `${rules.unlockHours}h`],
                ["Impact cap", `${rules.impactCap}% / ${rules.impactWindow} min`],
                ["Launch delay", `${rules.launchDelay}s`],
              ].map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    {label}
                  </dt>
                  <dd className="font-mono text-sm tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
              <span>
                Supply{" "}
                <span className="font-mono text-foreground">
                  {formatTokens(Number(formatEther(launch.supply)))}
                </span>
              </span>
              <span>
                Pool{" "}
                <span className="font-mono text-foreground">
                  {launch.pool.slice(0, 10)}…
                </span>
              </span>
              <span>Fee tier 1%</span>
            </div>
          </section>
        </div>

        <TradePanel launch={launch} onDone={reload} />
      </div>
    </Frame>
  );
}
