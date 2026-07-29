"use client";

import { useState } from "react";
import Image from "next/image";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FullWidthDivider } from "@/components/full-width-divider";
import { LOGO_RATIOS } from "@/lib/logo-ratios";
import { cn } from "@/lib/utils";

/** Fournisseur EIP-1193 injecté par les extensions de wallet. */
type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

type WalletSlug = Extract<keyof typeof LOGO_RATIOS, `wallet-${string}`>;

type WalletDef = {
  name: string;
  slug: WalletSlug;
  /** Extension navigateur : connectable directement via window.ethereum. */
  injected: boolean;
};

const WALLETS: WalletDef[] = [
  { name: "MetaMask", slug: "wallet-metamask", injected: true },
  { name: "Rabby", slug: "wallet-rabby", injected: true },
  { name: "Rainbow", slug: "wallet-rainbow", injected: true },
  { name: "Zerion", slug: "wallet-zerion", injected: true },
  { name: "Trust Wallet", slug: "wallet-trust", injected: true },
  { name: "Phantom", slug: "wallet-phantom", injected: true },
  { name: "WalletConnect", slug: "wallet-wallet-connect", injected: false },
  { name: "Ledger", slug: "wallet-ledger", injected: false },
  { name: "Safe", slug: "wallet-safe", injected: false },
  { name: "Argent", slug: "wallet-argent", injected: false },
];

const LOGO_SIZE = 30;

function WalletLogo({ slug, size = LOGO_SIZE }: { slug: WalletSlug; size?: number }) {
  return (
    <Image
      src={`/logos/${slug}.svg`}
      alt=""
      width={Math.round(size * LOGO_RATIOS[slug])}
      height={size}
      unoptimized
      className="select-none object-contain"
      style={{ height: size, width: "auto" }}
    />
  );
}

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

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnect() {
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function connect(wallet: WalletDef) {
    setError(null);

    if (!wallet.injected) {
      setError(`${wallet.name} nécessite son SDK, pas encore branché.`);
      return;
    }
    if (typeof window === "undefined" || !window.ethereum) {
      setError(`Aucune extension détectée. Installez ${wallet.name} puis réessayez.`);
      return;
    }

    setPending(wallet.slug);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts?.[0]) {
        setAccount(accounts[0]);
        setOpen(false);
      }
    } catch {
      // Refus de l'utilisateur ou requête déjà en attente côté extension.
      setError("Connexion refusée.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="relative px-4 py-14 sm:py-20">
      <FullWidthDivider className="-top-px" />

      <div className="mx-auto grid max-w-4xl grid-cols-1 items-center gap-10 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            Connect with your favorite wallet
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Bring any EVM wallet. Reveal reads your positions and unlock
            schedule the moment you connect.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Wallet />
                  {account ? shorten(account) : "Connect wallet"}
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect a wallet</DialogTitle>
                  <DialogDescription>
                    Choose how you want to connect to Reveal.
                  </DialogDescription>
                </DialogHeader>

                <ul className="-mx-1 max-h-[340px] space-y-1 overflow-y-auto px-1">
                  {WALLETS.map((wallet) => (
                    <li key={wallet.slug}>
                      <button
                        type="button"
                        onClick={() => connect(wallet)}
                        disabled={pending !== null}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors",
                          "hover:border-border hover:bg-muted",
                          "focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:outline-none",
                          "disabled:opacity-60"
                        )}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center">
                          <WalletLogo slug={wallet.slug} size={26} />
                        </span>
                        <span className="flex-1 text-sm font-medium">
                          {wallet.name}
                        </span>
                        {pending === wallet.slug ? (
                          <span className="text-xs text-muted-foreground">
                            Connecting…
                          </span>
                        ) : !wallet.injected ? (
                          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            Soon
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>

                {error && (
                  <p role="alert" className="mt-3 text-xs text-muted-foreground">
                    {error}
                  </p>
                )}
              </DialogContent>
            </Dialog>

            {account && (
              <span className="font-mono text-xs text-muted-foreground">
                Connected
              </span>
            )}
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
