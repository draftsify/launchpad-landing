"use client";

import { Wallet } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { WalletDialog } from "@/components/site/wallet-dialog";
import { useWallet } from "@/components/site/wallet-provider";
import { RULES } from "@/lib/presets";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

// Exemple lisible : une position de 6h, sans perte, valant 4% du pool. Les
// trois zones somment toujours à 100 — c'est la même grammaire que la section
// « mechanics », pour qu'un chiffre veuille dire la même chose partout.
const UNLOCKED = 34;
const EXECUTES = 25;

const ZONES = [
  { key: "executes", swatch: "bg-foreground/75", label: "Executes now", value: EXECUTES },
  {
    key: "waiting",
    swatch: "border border-dashed border-foreground/25 bg-foreground/[0.07]",
    label: "Next window",
    value: UNLOCKED - EXECUTES,
  },
  { key: "vesting", swatch: "bg-foreground/[0.08]", label: "Still vesting", value: 100 - UNLOCKED },
];

/**
 * Sans contrat déployé ni indexeur, aucune position réelle n'est lisible. On
 * montre donc l'exemple explicitement étiqueté, dans les deux états, plutôt
 * que d'inventer des chiffres présentés comme ceux du wallet.
 */
export function TokenPosition({ ticker }: { ticker: string }) {
  const { account } = useWallet();
  const reduce = useReducedMotion();

  return (
    <section className="flex h-full flex-col gap-5 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-medium">Your position</h3>
          <p className="text-xs text-muted-foreground">
            How a stake in ${ticker} gets metered.
          </p>
        </div>
        <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          Example
        </span>
      </div>

      <div className="flex h-11 gap-0.5 rounded-xl border bg-muted/20 p-0.5">
        {ZONES.map((zone, i) => (
          <motion.div
            key={zone.key}
            className={cn("rounded-lg", zone.swatch)}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${zone.value}%` }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.9, delay: 0.15 + i * 0.1, ease: EASE }
            }
          />
        ))}
      </div>

      <ul className="space-y-2">
        {ZONES.map((zone) => (
          <li key={zone.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("size-2.5 shrink-0 rounded-[3px]", zone.swatch)}
            />
            <span className="text-xs text-muted-foreground">{zone.label}</span>
            <span className="ml-auto font-mono text-xs tabular-nums">
              {zone.value}%
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto border-t pt-4">
        {account ? (
          <p className="text-xs text-muted-foreground">
            No ${ticker} position found for this wallet. Selling is capped at{" "}
            {RULES.impactCap}% of liquidity per {RULES.impactWindow} minutes.
          </p>
        ) : (
          <WalletDialog>
            <Button variant="card" className="w-full">
              <Wallet />
              Connect to see your numbers
            </Button>
          </WalletDialog>
        )}
      </div>
    </section>
  );
}
