"use client";

import Image from "next/image";
import { Check, LogOut } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LOGO_RATIOS } from "@/lib/logo-ratios";
import { useWallet, shortenAddress } from "@/components/site/wallet-provider";
import { cn } from "@/lib/utils";

export type WalletSlug = Extract<keyof typeof LOGO_RATIOS, `wallet-${string}`>;

export type WalletDef = {
  name: string;
  slug: WalletSlug;
  /** Extension navigateur : connectable directement via window.ethereum. */
  injected: boolean;
};

export const WALLETS: WalletDef[] = [
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

export function WalletLogo({
  slug,
  size = 30,
}: {
  slug: WalletSlug;
  size?: number;
}) {
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

/**
 * Modale partagée : le déclencheur est fourni par l'appelant (header, section
 * d'accueil), mais l'état de connexion vit dans le provider.
 */
export function WalletDialog({ children }: { children: React.ReactNode }) {
  const { account, pending, error, open, setOpen, connect, disconnect } =
    useWallet();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent>
        {account ? (
          <>
            <DialogHeader>
              <DialogTitle>Wallet connected</DialogTitle>
              <DialogDescription>
                You are connected to Reveal with this address.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                <Check className="size-4" />
              </span>
              <span className="flex-1 font-mono text-sm">
                {shortenAddress(account)}
              </span>
            </div>

            <Button
              variant="card"
              className="mt-3 w-full"
              onClick={disconnect}
            >
              <LogOut />
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Connect a wallet</DialogTitle>
              <DialogDescription>
                Choose how you want to connect to Reveal.
              </DialogDescription>
            </DialogHeader>

            <ul className="scrollbar-slim -mx-1 max-h-[340px] space-y-1 overflow-y-auto px-1">
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
