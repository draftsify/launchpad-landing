"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé) : on n'affiche rien.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="group/copy inline-flex items-center gap-1.5 rounded-md font-mono text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:outline-none"
      aria-label={copied ? "Address copied" : `Copy contract address ${address}`}
    >
      {shortenAddress(address)}
      {copied ? (
        <Check className="size-3" />
      ) : (
        <Copy className="size-3 opacity-60 transition-opacity group-hover/copy:opacity-100" />
      )}
    </button>
  );
}
