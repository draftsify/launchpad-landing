"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText, LibraryBig, Route } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

const ITEMS = [
  {
    label: "How it works",
    href: "/how-it-works",
    description: "Unlock curves, drawdown relief, anti-sniper.",
    icon: Route,
  },
  {
    label: "Docs",
    href: "/docs",
    description: "Parameters, integration, contract reference.",
    icon: LibraryBig,
  },
  {
    label: "Terms & Policy",
    href: "/terms",
    description: "The rules you agree to when you launch.",
    icon: FileText,
  },
];

/**
 * Menu au survol. Radix DropdownMenu est pensé pour le clic ; le piloter au
 * survol demandait autant de code que ce composant, sans le contrôle fin de
 * l'animation (panneau + entrées décalées).
 */
export function ProtocolMenu() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  // Petit délai : sans lui, traverser l'espace entre le bouton et le panneau
  // referme le menu.
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => cancelClose, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        onFocus={openNow}
        className="inline-flex h-9 w-max items-center justify-center gap-1 rounded-full px-3 text-sm font-medium text-foreground/90 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/50 aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        Protocol
        <ChevronDown
          className={`size-3.5 text-muted-foreground transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Protocol"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.26, ease: EASE }}
            style={{ transformOrigin: "top left" }}
            className="absolute top-full left-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border bg-card p-1 shadow-2xl"
          >
            {ITEMS.map((item, i) => (
              <motion.div
                key={item.href}
                initial={reduce ? undefined : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.05 + i * 0.05,
                  ease: EASE,
                }}
              >
                <Link
                  role="menuitem"
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/60">
                    <item.icon className="size-3.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
