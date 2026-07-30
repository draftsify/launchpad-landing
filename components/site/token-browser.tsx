"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { TokenCard } from "@/components/site/token-card";
import { SORTS, type SortId, type Token, sortTokens } from "@/lib/tokens";
import { cn } from "@/lib/utils";

function matches(token: Token, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    token.name.toLowerCase().includes(q) ||
    token.ticker.toLowerCase().includes(q) ||
    token.address.toLowerCase().includes(q)
  );
}

export function TokenBrowser({ tokens }: { tokens: Token[] }) {
  const [sort, setSort] = useState<SortId>("recent");
  const [query, setQuery] = useState("");

  const shown = useMemo(
    () => sortTokens(tokens.filter((t) => matches(t, query)), sort),
    [tokens, query, sort]
  );

  const active = SORTS.find((s) => s.id === sort)!;
  const searching = query.trim().length > 0;

  // Aucun token déployé : trier et filtrer le vide n'apprend rien, et des
  // onglets inertes se lisent comme une panne. On dit l'état réel à la place.
  if (tokens.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-20 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border bg-card">
          <Coins className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">No token has launched yet</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            This list reads the launcher contract. It stays empty until the
            first launch — yours can be it.
          </p>
        </div>
        <Button asChild>
          <Link href="/create">
            Launch a token
            <ArrowRight />
          </Link>
        </Button>
      </div>
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

      {/* Ce que le tri courant veut dire, et ce que la recherche a retenu :
          sans ça, un ordre qui change n'apprend rien. */}
      <p role="status" className="mt-3 text-xs text-muted-foreground">
        {shown.length} {shown.length === 1 ? "token" : "tokens"}
        {searching ? ` matching “${query.trim()}”` : ""} · {active.hint}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {shown.map((token, i) => (
            <TokenCard key={token.slug} token={token} index={i} />
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
