"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Protocol", href: "#protocol", hasMenu: true },
  { label: "Explore", href: "#explore", hasMenu: true },
  { label: "Docs", href: "#docs", hasMenu: false },
];

export function Header() {
  const [open, setOpen] = useState(false);

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
            {NAV.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="inline-flex h-9 w-max items-center justify-center gap-1 rounded-full px-3 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                  {item.hasMenu && (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  )}
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
        <Button variant="outline" asChild>
          <Link href="#app">Sign in</Link>
        </Button>
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
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-foreground/90 transition-colors hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Button variant="outline" asChild>
                <Link href="#app" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
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
