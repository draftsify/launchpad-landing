"use client";

import * as React from "react";

/** Fournisseur EIP-1193 injecté par les extensions de wallet. */
type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

type WalletContextValue = {
  account: string | null;
  pending: string | null;
  error: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  connect: (wallet: { name: string; slug: string; injected: boolean }) => void;
  disconnect: () => void;
};

const WalletContext = React.createContext<WalletContextValue | null>(null);

export function useWallet() {
  const ctx = React.useContext(WalletContext);
  if (!ctx) throw new Error("useWallet doit être utilisé dans <WalletProvider>");
  return ctx;
}

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  // Reprise silencieuse : eth_accounts ne déclenche aucune fenêtre, contrairement
  // à eth_requestAccounts. Sans ça, l'état « connecté » serait perdu à chaque
  // rechargement alors que l'autorisation, elle, est toujours valide.
  React.useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    let cancelled = false;
    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (!cancelled && list?.[0]) setAccount(list[0]);
      })
      .catch(() => {});

    const onAccountsChanged = (...args: never[]) => {
      const list = args[0] as unknown as string[];
      setAccount(list?.[0] ?? null);
    };
    provider.on?.("accountsChanged", onAccountsChanged);

    return () => {
      cancelled = true;
      provider.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const connect = React.useCallback(
    async (wallet: { name: string; slug: string; injected: boolean }) => {
      setError(null);

      if (!wallet.injected) {
        setError(`${wallet.name} needs its own SDK, not wired up yet.`);
        return;
      }
      if (typeof window === "undefined" || !window.ethereum) {
        setError(`No extension detected. Install ${wallet.name} and try again.`);
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
        // Refus de l'utilisateur, ou requête déjà en attente côté extension.
        setError("Connection rejected.");
      } finally {
        setPending(null);
      }
    },
    []
  );

  // Aucun standard ne permet de révoquer l'autorisation côté extension :
  // on ne fait qu'oublier le compte localement.
  const disconnect = React.useCallback(() => {
    setAccount(null);
    setError(null);
    setOpen(false);
  }, []);

  const value = React.useMemo(
    () => ({ account, pending, error, open, setOpen, connect, disconnect }),
    [account, pending, error, open, connect, disconnect]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
