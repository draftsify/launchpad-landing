"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { activeChain, isDeployed } from "@/lib/chain";
import { matchesQuery, SORTS, sortLaunches, type SortId } from "@/lib/tokens";
import { Button } from "@/components/ui/button";
import { TokenCard } from "@/components/site/token-card";
import { useLaunches } from "@/components/site/use-launches";
import { cn } from "@/lib/utils";

function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border bg-card">
        <Coins className="size-5 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}

export function TokenBrowser() {
  const { data: launches, loading, error } = useLaunches();
  const [sort, setSort] = useState<SortId>("recent");
  const [query, setQuery] = useState("");

  const shown = useMemo(
    () => sortLaunches(launches.filter((l) => matchesQuery(l, query)), sort),
    [launches, query, sort]
  );

  const active = SORTS.find((s) => s.id === sort)!;
  const searching = query.trim().length > 0;

  // Trois vides différents, qui ne veulent pas dire la même chose. Les
  // confondre ferait lire « rien n'existe » là où c'est le nœud qui n'a pas
  // répondu, ou l'inverse.
  if (!isDeployed) {
    return (
      <Empty title="No launcher deployed yet">
        This list reads the RevealLauncher contract on {activeChain.name}. None is
        deployed, so there is nothing to read — not even an empty registry.
      </Empty>
    );
  }

  if (loading) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Reading {activeChain.name}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-20 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border bg-card">
          <TriangleAlert className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">The node did not answer</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            This is a connection problem, not an empty launchpad — there may well
            be tokens. {error}
          </p>
        </div>
      </div>
    );
  }

  if (launches.length === 0) {
    return (
      <Empty
        title="No token has launched yet"
        action={
          <Button asChild>
            <Link href="/create">
              Launch a token
              <ArrowRight />
            </Link>
          </Button>
        }
      >
        The launcher is live and its registry is empty. Yours can be the first.
      </Empty>
    );
  }

  return (
    <>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Sort tokens"
          className="flex flex-wrap items-center gap-1"
        >
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sort === s.id}
              title={s.hint}
              onClick={() => setSort(s.id)}
              className={cn(
                "h-8 rounded-full px-3 text-sm transition-colors",
                sort === s.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or ticker"
            aria-label="Search tokens"
            className="h-9 w-full rounded-full border bg-card pr-9 pl-9 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-foreground/60 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <p role="status" className="mt-3 text-xs text-muted-foreground">
        {shown.length} {shown.length === 1 ? "token" : "tokens"}
        {searching ? ` matching “${query.trim()}”` : ""} · {active.hint}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {shown.map((launch, i) => (
            <TokenCard key={launch.address} launch={launch} index={i} />
          ))}
        </AnimatePresence>

        {shown.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center lg:col-span-2">
            <p className="font-medium">No token matches “{query.trim()}”</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Search by name, ticker, or contract address.
            </p>
            <Button variant="card" onClick={() => setQuery("")}>
              Clear search
            </Button>
          </div>
        )}

        {/* L'emplacement libre n'a de sens qu'en vue complète : au milieu d'un
            résultat de recherche, il se lirait comme une correspondance. */}
        {!searching && (
          <motion.div
            layout
            className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-14 text-center"
          >
            <span className="flex size-11 items-center justify-center rounded-full border bg-card">
              <Coins className="size-5 text-muted-foreground" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Your token here</p>
              <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                Name it, add an image, launch. You pay gas.
              </p>
            </div>
            <Button variant="card" asChild>
              <Link href="/create">
                Launch a token
                <ArrowRight />
              </Link>
            </Button>
          </motion.div>
        )}
      </div>
    </>
  );
}
