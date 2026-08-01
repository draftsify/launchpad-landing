"use client";

import { useEffect, useState } from "react";
import { KeyRound, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FeesPanel } from "@/components/site/treasury-fees";
import { WalletDialog } from "@/components/site/wallet-dialog";
import { useWallet, shortenAddress } from "@/components/site/wallet-provider";
import { activeChain, isDeployed } from "@/lib/chain";
import { readTreasury } from "@/lib/onchain";

/**
 * Le code d'entrée.
 *
 * À lire pour ce qu'il est : un rideau, pas une serrure. Il voyage dans le
 * bundle envoyé au navigateur, donc quiconque ouvre les outils de développement
 * le lit. Ce n'est pas grave, et pour une raison mécanique plutôt que
 * rassurante : `collect` est appelable par n'importe qui dans le contrat, et
 * paie la trésorerie inscrite dans le constructeur quel que soit l'expéditeur.
 * Un inconnu qui franchirait ce rideau ne pourrait que payer la trésorerie, de
 * sa poche en gas. Le reste des actions — vendre, déballer — exige une
 * signature du portefeuille connecté et ne touche que ce portefeuille.
 *
 * Ce que le rideau fait vraiment : éviter qu'une page d'administration
 * s'ouvre par hasard, et le dire à celui qui la trouve.
 */
const CODE = "19092005NAT";

/** Retenu pour l'onglet, pas au-delà : un rechargement ne redemande rien. */
const KEY = "reveal.console";

export function TreasuryConsole() {
  const { account } = useWallet();
  const [unlocked, setUnlocked] = useState(false);
  const [typed, setTyped] = useState("");
  const [wrong, setWrong] = useState(false);
  const [treasury, setTreasury] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(KEY) === CODE) setUnlocked(true);
  }, []);

  useEffect(() => {
    readTreasury()
      .then(setTreasury)
      .catch(() => {});
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (typed.trim().toUpperCase() !== CODE) {
      setWrong(true);
      return;
    }
    sessionStorage.setItem(KEY, CODE);
    setUnlocked(true);
  }

  if (!unlocked) {
    return (
      <section className="mx-auto w-full max-w-sm px-4 py-24">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-xl font-medium tracking-tight">Treasury</h1>
            <p className="text-sm text-muted-foreground">
              Enter the code to open the console.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border bg-card px-3">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setWrong(false);
              }}
              // `password` plutôt que `text` : la page peut s'ouvrir devant
              // quelqu'un, et un code affiché en clair se retient.
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Code"
              aria-label="Console code"
              className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {wrong && (
            <p role="alert" className="text-xs text-muted-foreground">
              Not that one.
            </p>
          )}

          <Button type="submit" className="w-full">
            Open
          </Button>
        </form>
      </section>
    );
  }

  const isTreasury =
    !!account && !!treasury && account.toLowerCase() === treasury.toLowerCase();

  return (
    <section className="mx-auto w-full max-w-lg space-y-6 px-4 py-16">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-medium tracking-tight">Treasury</h1>
        <p className="text-sm text-muted-foreground">
          Collect the swap fees accrued to every locked position on{" "}
          {activeChain.name}. Collecting is permissionless — this page only
          sends the transaction, and the payout address is written into the
          locker&apos;s constructor.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">
            {account ? shortenAddress(account) : "No wallet connected"}
          </p>
          <p className="text-xs text-muted-foreground">
            {!account
              ? "Connect the treasury wallet to see what it is owed."
              : isTreasury
                ? "This is the treasury."
                : "Not the treasury — collecting still pays the treasury, not this wallet."}
          </p>
        </div>
        <WalletDialog>
          <Button variant="card" size="sm">
            <Wallet />
            {account ? "Change" : "Connect"}
          </Button>
        </WalletDialog>
      </div>

      {isDeployed ? (
        <FeesPanel standalone />
      ) : (
        <p className="text-sm text-muted-foreground">
          No launcher is configured for this deployment.
        </p>
      )}
    </section>
  );
}
