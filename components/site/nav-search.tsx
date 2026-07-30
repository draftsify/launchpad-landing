"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { TokenMark } from "@/components/site/token-mark";
import { searchTokens } from "@/lib/tokens";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * « Explore » se déplie en champ de recherche à la place du lien, plutôt que
 * d'ouvrir une palette : la barre garde sa hauteur et rien ne saute autour.
 */
export function NavSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const results = searchTokens(query);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    const onClickAway = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickAway);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickAway);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <motion.div
        animate={{ width: open ? 272 : 92 }}
        initial={false}
        transition={
          reduce ? { duration: 0 } : { duration: 0.42, ease: EASE }
        }
        className="relative h-9"
      >
        {open ? (
          <div className="flex h-9 items-center gap-2 rounded-full border bg-card pr-1 pl-3">
            <Search
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tokens"
              aria-label="Search tokens"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              aria-label="Close search"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:outline-none"
          >
            Explore
            <Search aria-hidden className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={
              reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE }}
            style={{ transformOrigin: "top left" }}
            className="absolute top-full left-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border bg-card p-1 shadow-2xl"
          >
            {results.length > 0 ? (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                  Tokens
                </p>
                {results.map((token) => (
                  <Link
                    key={token.ticker}
                    href={`/token/${token.slug}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted"
                  >
                    <TokenMark token={token} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {token.name}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        ${token.ticker}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {token.marketCap}
                    </span>
                  </Link>
                ))}
              </>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {/* Sans requête, rien n'a été cherché : dire « aucune
                    correspondance » ferait porter au visiteur un vide qui
                    n'est pas le sien. */}
                {query.trim()
                  ? `No token matches “${query.trim()}”.`
                  : "No token has launched yet."}
              </p>
            )}

            <div className="mt-1 border-t p-1">
              <Link
                href="/launchpad"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Browse all launches
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
