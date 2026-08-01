"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TokenMark } from "@/components/site/token-mark";
import { explorerAddress, explorerTx } from "@/lib/chain";

/**
 * Ce qu'on veut faire dans les secondes qui suivent un lancement.
 *
 * L'adresse du contrat, et rien d'autre. Elle se colle dans un message, dans un
 * terminal, dans un portefeuille — c'est le seul objet qui compte tant que
 * personne n'a encore acheté, et il n'existait jusqu'ici que sous la forme d'un
 * lien « Token contract » vers l'explorateur, qu'il fallait ouvrir puis
 * sélectionner à la main.
 *
 * Elle est écrite en entier, pas raccourcie. Un `0x52…d71b` se lit mais ne se
 * vérifie pas, et c'est précisément le moment où quelqu'un s'apprête à le
 * diffuser à des gens qui, eux, le compareront caractère par caractère.
 */
export function LaunchSuccess({
  token,
  hash,
  name,
  symbol,
  image,
}: {
  token?: string;
  hash: string;
  name: string;
  symbol: string;
  image?: string;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Presse-papiers refusé — contexte non sécurisé, ou permission refusée.
      // L'adresse reste affichée en entier, donc sélectionnable à la main.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{name || symbol} is live</DialogTitle>
          <DialogDescription>
            The pool is open and the rules are already running. Share the
            address — it is what anyone needs to find it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <TokenMark symbol={symbol} image={image} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">${symbol}</p>
          </div>
        </div>

        {token && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Contract address</p>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Address copied" : `Copy ${token}`}
              className="flex w-full items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:outline-none"
            >
              <span className="font-mono text-xs break-all">{token}</span>
              {copied ? (
                <Check className="size-4 shrink-0" />
              ) : (
                <Copy className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            <p className="text-xs text-muted-foreground">
              {copied ? "Copied." : "Click to copy."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {token && (
            <Button asChild className="flex-1">
              <Link href={`/token/${token}`}>
                Open its page
                <ArrowUpRight />
              </Link>
            </Button>
          )}
          {token && explorerAddress(token) && (
            <Button variant="card" asChild>
              <a href={explorerAddress(token)} target="_blank" rel="noreferrer">
                Explorer
              </a>
            </Button>
          )}
          {!token && explorerTx(hash) && (
            <Button variant="card" asChild className="flex-1">
              <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
                Transaction
              </a>
            </Button>
          )}
        </div>

        {/* Le cas où le reçu n'a pas livré l'adresse : le lancement a bien eu
            lieu, seule la lecture du journal a échoué. Le dire, plutôt que de
            laisser une fenêtre à moitié vide. */}
        {!token && (
          <p className="text-xs text-muted-foreground">
            The launch went through, but the address could not be read back from
            the receipt. Open the transaction to find it.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
