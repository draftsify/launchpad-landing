"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, FileText, Route, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WalletDialog } from "@/components/site/wallet-dialog";
import { useWallet } from "@/components/site/wallet-provider";
import { cn } from "@/lib/utils";

const PROTOCOL_MENU = [
  {
    label: "How it works",
    href: "/how-it-works",
    description: "Unlock curves, impact caps, anti-sniper.",
    icon: Route,
  },
  {
    label: "Terms & Policy",
    href: "/terms",
    description: "The rules you agree to when you launch.",
    icon: FileText,
  },
];

const LINKS = [
  { label: "Explore", href: "/launchpad" },
  { label: "Docs", href: "#docs" },
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
          <ul className="flex items-center">
            <li>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="group/protocol inline-flex h-9 w-max items-center justify-center gap-1 rounded-full px-3 text-sm font-medium text-foreground/90 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/50 data-[state=open]:bg-muted data-[state=open]:text-foreground"
                  >
                    Protocol
                    <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]/protocol:rotate-180" />
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start">
                  {PROTOCOL_MENU.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href}>
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/60">
                          <item.icon className="size-3.5" />
                        </span>
                        <span className="space-y-0.5">
                          <span className="block font-medium">
                            {item.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>

            {LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="inline-flex h-9 w-max items-center justify-center rounded-full px-3 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
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
        <Button asChild>
          <Link href="#create">
            Launch a token
            <ArrowUpRight className="transition-transform group-hover/button:translate-x-0.5 group-hover/button:-translate-y-px" />
          </Link>
        </Button>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-14 border-b bg-background/95 backdrop-blur-lg md:hidden"
        >
          <div className="flex flex-col gap-1 px-4 py-4">
            {[...PROTOCOL_MENU, ...LINKS].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-foreground/90 transition-colors hover:bg-muted"
              >
                {"label" in item ? item.label : null}
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
              <Button asChild>
                <Link href="#create" onClick={() => setOpen(false)}>
                  Launch a token
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
