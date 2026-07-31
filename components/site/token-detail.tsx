"use client";

import Link from "next/link";
import { ArrowLeft, Globe, Loader2, Send, TriangleAlert } from "lucide-react";

import { activeChain, explorerAddress, isDeployed } from "@/lib/chain";
import { formatAge, formatTokens, formatValue } from "@/lib/format";
import { formatDuration } from "@/lib/presets";
import { Button } from "@/components/ui/button";
import { CopyAddress } from "@/components/site/copy-address";
import { FullWidthDivider } from "@/components/full-width-divider";
import { PriceChart } from "@/components/site/price-chart";
import { useActivity } from "@/components/site/use-activity";
import { TokenMark } from "@/components/site/token-mark";
import { TradePanel } from "@/components/site/trade-panel";
import { GraduationCard } from "@/components/site/graduation-card";
import { hiddenReason, linksMuted } from "@/lib/hidden";
import { useLaunch } from "@/components/site/use-launches";
import { useRules } from "@/components/site/use-rules";
import { useEthPrice } from "@/components/site/use-eth-price";
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
  const hidden = hiddenReason(slug);
  // Les règles affichées sont celles que le launcher applique, pas une copie.
  const rules = useRules();
  // Le prix de l'ETH, pour afficher en dollars. Null quand la source ne repond
  // pas : on retombe alors sur l'ETH plutot que d'inventer une conversion.
  const usd = useEthPrice();
  // L'historique, relu depuis les journaux du pool par /api/activity.
  const activity = useActivity(slug);

  /**
   * Une valeur issue des journaux, ou un tiret.
   *
   * Le tiret n'est pas un détail de présentation : « 0 trade » et « pas encore
   * relu » se ressemblent à l'écran et ne veulent pas du tout dire la même
   * chose. Tant que la relecture n'a pas abouti, on n'affirme rien.
   */
  const indexed = (read: (a: NonNullable<typeof activity.data>) => string) =>
    activity.data ? read(activity.data) : "—";

  /**
   * Un token retiré de la liste garde une page qui dit pourquoi.
   *
   * Le renvoyer sur « rien ne répond à cette adresse » serait faux : le token
   * existe, son pool aussi, et quelqu'un qui arrive ici en détient peut-être.
   * Lui laisser le lien vers l'explorateur est le minimum — l'interface a le
   * droit de ne pas lister, pas celui de faire croire à une disparition.
   */
  if (hidden) {
    return (
      <Frame>
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-20 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border bg-card">
            <TriangleAlert className="size-5 text-muted-foreground" />
          </span>
          <p className="font-medium">Not listed on this site</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {hidden} This token still exists on {activeChain.name} and stays
            tradable elsewhere — the protocol has no owner and nothing here can
            remove it. Not listing it is this site&apos;s decision alone.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="card" asChild>
              <Link href="/launchpad">Browse launches</Link>
            </Button>
            <Button variant="ghost" asChild>
              <a href={explorerAddress(slug)} target="_blank" rel="noreferrer">
                View on explorer
              </a>
            </Button>
          </div>
        </div>
      </Frame>
    );
  }

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
  ]
    // Certains documents portent un lien qui n'aide personne. On ne le montre
    // pas ; il reste dans le contrat, lisible par qui veut.
    .filter(() => !linksMuted(launch.address))
    .filter(Boolean) as { label: string; href: string; icon: React.ReactNode }[];

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
          ["Market cap", formatValue(launch.marketCapEth, usd)],
          ["Liquidity", formatValue(launch.liquidityEth, usd)],
          ["Price", formatValue(launch.priceEth, usd)],
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

      {/* Seconde rangée : ce qui vient des journaux et non de l'état. Un tiret
          plutôt qu'un zéro tant que la relecture n'a pas abouti — zéro trade et
          « pas encore lu » ne sont pas la même information. */}
      <div className="mt-2 grid divide-y rounded-2xl border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
        {[
          ["24h volume", indexed((a) => formatValue(a.volume24h, usd))],
          ["24h change", indexed((a) => (a.change24h === null ? "No trade 24h ago" : `${a.change24h >= 0 ? "+" : ""}${a.change24h.toFixed(1)}%`))],
          ["Trades", indexed((a) => a.trades.toLocaleString("en-US"))],
          ["Holders", indexed((a) => a.holders.toLocaleString("en-US"))],
        ].map(([label, value]) => (
          <div key={label} className="space-y-1 px-4 py-3 sm:px-5">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              {label}
            </p>
            <p className="text-lg font-medium tracking-tight tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* `items-start` : sans lui, la grille étire chaque colonne à la hauteur
          de la plus haute, et une colonne étirée fausse tout calcul de hauteur
          en pourcentage à l'intérieur. */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="space-y-4">
          {/* Le prix d'hier n'est pas un état : il est reconstruit en relisant
              les Swap du pool. C'est ce que fait /api/activity, et la courbe
              ci-dessous ne contient que des prix qui ont réellement été cotés. */}
          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">Price</h2>
              <p className="text-xs text-muted-foreground">
                Rebuilt from every swap this pool has emitted.
              </p>
            </div>

            {activity.loading ? (
              <div className="flex h-[200px] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Replaying the pool&apos;s swaps…
              </div>
            ) : activity.error ? (
              <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center">
                <p className="text-sm font-medium">The swap history could not be read</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  The price above still comes straight from the pool and is
                  current. Only the history failed. {activity.error}
                </p>
              </div>
            ) : (
              <PriceChart points={activity.data?.series ?? []} />
            )}
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
                ["Fully unlocked after", formatDuration(rules.unlockHours)],
                ["Buy ramp", `${rules.buyRamp} min`],
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

        <div className="space-y-4">
          <TradePanel launch={launch} onDone={reload} />
          <GraduationCard launch={launch} />
        </div>
      </div>
    </Frame>
  );
}
