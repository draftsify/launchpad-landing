import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, Globe, Send } from "lucide-react";

import { Shell } from "@/components/site/shell";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { XIcon } from "@/components/x-icon";
import { CopyAddress } from "@/components/site/copy-address";
import { MarketCapChart } from "@/components/site/market-cap-chart";
import { TokenPosition } from "@/components/site/token-position";
import { TOKENS, getToken } from "@/lib/tokens";

export function generateStaticParams() {
  return TOKENS.map((token) => ({ slug: token.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const token = getToken(slug);
  if (!token) return { title: "Token not found — Reveal" };

  return {
    title: `${token.name} ($${token.ticker}) — Reveal`,
    description: token.description,
  };
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const token = getToken(slug);
  if (!token) notFound();

  const links = [
    token.links.website && {
      label: token.links.website,
      href: `https://${token.links.website}`,
      icon: <Globe />,
    },
    token.links.x && {
      label: `@${token.links.x}`,
      href: `https://x.com/${token.links.x}`,
      icon: <XIcon />,
    },
    token.links.telegram && {
      label: `t.me/${token.links.telegram}`,
      href: `https://t.me/${token.links.telegram}`,
      icon: <Send />,
    },
  ].filter(Boolean) as { label: string; href: string; icon: React.ReactNode }[];

  return (
    <Shell>
      <section className="relative px-4 pt-8 pb-16 sm:pt-10">
        <FullWidthDivider className="-top-px" />

        <Link
          href="/launchpad"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All launches
        </Link>

        <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 sm:gap-5">
            <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl border bg-muted/50 sm:size-24">
              <Image
                src={token.logo}
                alt=""
                width={512}
                height={287}
                priority
                className="h-9 w-auto sm:h-11"
              />
            </span>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                  {token.name}
                </h1>
                <span className="font-mono text-sm text-muted-foreground">
                  ${token.ticker}
                </span>
                {token.trending && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] font-medium">
                    <Flame className="size-3" />
                    Trending
                  </span>
                )}
              </div>

              <p className="max-w-xl text-sm text-muted-foreground">
                {token.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                <CopyAddress address={token.address} />
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
              </div>
            </div>
          </div>

          {/* Aucun contrat déployé : le bouton reste inerte plutôt que de
              renvoyer ailleurs en prétendant ouvrir un échange. */}
          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <Button size="lg" disabled className="w-full sm:w-auto">
              Trade
            </Button>
            <p className="text-xs text-muted-foreground">
              Trading opens when the contracts ship.
            </p>
          </div>
        </header>

        {/* La capitalisation n'est pas répétée ici : c'est le titre du graphe
            ci-dessous, et deux fois le même nombre sous deux étiquettes se lit
            comme deux mesures différentes. */}
        <div className="mt-8 grid divide-y rounded-2xl border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
          {[
            ["Holders", token.holders],
            ["Liquidity", token.liquidity],
            ["Supply", token.supply],
            ["Age", token.age],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1 px-4 py-3 sm:px-5">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                {label}
              </p>
              <p className="text-lg font-medium tracking-tight">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(0,340px)]">
          <MarketCapChart
            points={token.series}
            launchValue={token.launchMarketCap}
          />
          <TokenPosition ticker={token.ticker} rules={token.rules} />
        </div>

        {/* Les règles de ce token précisément : c'est ce qu'un explorateur
            classique ne peut pas afficher. */}
        <section className="mt-4 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-medium">Launch rules</h2>
              <p className="text-sm text-muted-foreground">
                Written into the contract before the first buy. They cannot be
                changed.
              </p>
            </div>
            <Button variant="card" size="sm" asChild>
              <Link href="/how-it-works">What these mean</Link>
            </Button>
          </div>

          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Sellable at launch", `${token.rules.initialUnlock}%`],
              ["Fully unlocked after", `${token.rules.unlockHours}h`],
              [
                "Impact cap",
                `${token.rules.impactCap}% / ${token.rules.impactWindow} min`,
              ],
              ["Launch delay", `${token.rules.launchDelay}s`],
            ].map(([label, value]) => (
              <div key={label} className="space-y-1">
                <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {label}
                </dt>
                <dd className="font-mono text-sm tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 space-y-2 border-t pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Supply still vesting
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
        </section>

        <FullWidthDivider className="-bottom-px" />
      </section>
    </Shell>
  );
}
