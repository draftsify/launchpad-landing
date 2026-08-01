"use client";

import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import {
  WalletDialog,
  WalletLogo,
  type WalletSlug,
} from "@/components/site/wallet-dialog";
import { cn } from "@/lib/utils";

/** Damier volontairement irrégulier, comme sur la maquette. */
const TILES: { row: number; col: number; slug?: WalletSlug }[] = [
  { row: 0, col: 1, slug: "wallet-metamask" },
  { row: 0, col: 3, slug: "wallet-rainbow" },
  { row: 1, col: 0 },
  { row: 1, col: 2, slug: "wallet-wallet-connect" },
  { row: 1, col: 4, slug: "wallet-ledger" },
  { row: 2, col: 1, slug: "wallet-trust" },
  { row: 2, col: 3 },
  { row: 3, col: 0 },
  { row: 3, col: 2, slug: "wallet-rabby" },
  { row: 3, col: 4, slug: "wallet-zerion" },
  { row: 4, col: 1, slug: "wallet-safe" },
  { row: 4, col: 3, slug: "wallet-phantom" },
];

const CELL = 64;

export function WalletConnect() {
  return (
    <section className="relative px-4 py-14 sm:py-20">
      <FullWidthDivider className="-top-px" />

      <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-10 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            Connect with your wallet
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Bring any EVM wallet. Reveal reads your positions and unlock
            schedule the moment you connect.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Un appel à l'action, pas un indicateur d'état : l'adresse et le
                point « connecté » vivent dans l'en-tête, où ils restent
                visibles sur toutes les pages. Les répéter ici transformait une
                invitation en redite. */}
            <WalletDialog>
              <Button size="lg">
                <Wallet />
                Connect your wallet
              </Button>
            </WalletDialog>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="relative size-80">
            <div
              aria-hidden
              className={cn(
                "absolute inset-0 size-full",
                "bg-[linear-gradient(to_right,theme(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,theme(--color-border)_1px,transparent_1px)]",
                "bg-size-[64px_64px]",
                "mask-[radial-gradient(ellipse_at_center,black,black,transparent)]"
              )}
            />
            {TILES.map((tile) => (
              <div
                key={`${tile.row}-${tile.col}`}
                className={cn(
                  "absolute flex size-16 items-center justify-center",
                  tile.slug && "bg-secondary/40"
                )}
                style={{ left: tile.col * CELL, top: tile.row * CELL }}
              >
                {tile.slug && <WalletLogo slug={tile.slug} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <FullWidthDivider className="-bottom-px" />
    </section>
  );
}
