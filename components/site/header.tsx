"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProtocolMenu } from "@/components/site/protocol-menu";
import { NavSearch } from "@/components/site/nav-search";
import { WalletDialog } from "@/components/site/wallet-dialog";
import { useWallet } from "@/components/site/wallet-provider";
import { cn } from "@/lib/utils";
import { LaunchButton } from "@/components/site/launch-button";

// Reprise à plat pour le menu mobile, qui n'a ni survol ni recherche.
const MOBILE_LINKS = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Docs", href: "/docs" },
  { label: "Terms & Policy", href: "/terms" },
  { label: "Explore", href: "/launchpad" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { account } = useWallet();

  return (
    <header className="sticky top-0 z-50 mx-auto flex h-14 w-full max-w-5xl items-center justify-between border-b bg-background/95 px-4 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 md:px-2">
      <div className="flex h-9 items-center gap-2">
        <Link
          href="/"
          aria-label="Reveal, home"
          className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full px-3 hover:bg-muted"
        >
          <Image
            src="/logo.png"
            alt=""
            width={512}
            height={287}
            priority
            className="h-3.5 w-auto"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            Reveal
          </span>
        </Link>

        <div aria-hidden className="h-6 shrink-0 bg-border md:w-px" />

        <nav aria-label="Main navigation" className="hidden md:block">
          <ul className="flex items-center gap-0.5">
            <li>
              <ProtocolMenu />
            </li>
            <li>
              <NavSearch />
            </li>
          </ul>
        </nav>
      </div>

      <div className="md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-controls="mobile-menu"
          aria-expanded={open}
          aria-label="Open menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative size-4">
            <span
              className={cn(
                "absolute left-0 block h-0.5 w-4 bg-foreground transition-all duration-200",
                open ? "top-2 rotate-45" : "top-1"
              )}
            />
            <span
              className={cn(
                "absolute left-0 block h-0.5 w-4 bg-foreground transition-all duration-200",
                open ? "top-2 -rotate-45" : "top-2.5"
              )}
            />
          </span>
          <span className="sr-only">Toggle menu</span>
        </Button>
      </div>

      <div className="hidden items-center gap-2 md:flex">
        {/* La collecte a rejoint la modale du wallet : c'est une action de
            compte, et elle se cherche là où l'on regarde son compte. */}
        <WalletDialog>
          {account ? (
            // Connecté : l'icône suffit, l'adresse est déjà lisible dans
            // l'extension et alourdissait la barre.
            <Button
              variant="outline"
              size="icon"
              className="relative"
              aria-label="Wallet connected"
            >
              <Wallet />
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-foreground"
              />
            </Button>
          ) : (
            <Button variant="outline">Connect wallet</Button>
          )}
        </WalletDialog>
        <LaunchButton icon={<ArrowUpRight className="transition-transform group-hover/button:translate-x-0.5 group-hover/button:-translate-y-px" />} />
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-14 border-b bg-background/95 backdrop-blur-lg md:hidden"
        >
          <div className="flex flex-col gap-1 px-4 py-4">
            {MOBILE_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-foreground/90 transition-colors hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <WalletDialog>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {account ? (
                    <>
                      <Wallet />
                      Wallet connected
                    </>
                  ) : (
                    "Connect wallet"
                  )}
                </Button>
              </WalletDialog>
              <LaunchButton icon={<ArrowUpRight />} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
