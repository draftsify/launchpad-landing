"use client";

import * as React from "react";

import { activeChain, chainParams } from "@/lib/chain";

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
  /** Chaîne du wallet. Null tant qu'aucun fournisseur n'a répondu. */
  chainId: number | null;
  onCorrectChain: boolean;
  switchChain: () => Promise<boolean>;
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
  const [chainId, setChainId] = React.useState<number | null>(null);
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

    provider
      .request({ method: "eth_chainId" })
      .then((id) => {
        if (!cancelled) setChainId(Number(id as string));
      })
      .catch(() => {});

    const onAccountsChanged = (...args: never[]) => {
      const list = args[0] as unknown as string[];
      setAccount(list?.[0] ?? null);
    };
    // Changer de réseau depuis le wallet doit se voir sans rechargement.
    const onChainChanged = (...args: never[]) => {
      setChainId(Number(args[0] as unknown as string));
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);

    return () => {
      cancelled = true;
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
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

  /**
   * Bascule le wallet sur la bonne chaîne. Le code 4902 signifie que le wallet
   * ne la connaît pas : on la lui ajoute, ce qui est le cas normal pour une
   * chaîne récente.
   */
  const switchChain = React.useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) return false;

    const hexId = `0x${activeChain.id.toString(16)}`;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
      return true;
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code !== 4902) {
        setError("Network switch rejected.");
        return false;
      }
    }

    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [chainParams()],
      });
      return true;
    } catch {
      setError(`Could not add ${activeChain.name} to your wallet.`);
      return false;
    }
  }, []);

  // Aucun standard ne permet de révoquer l'autorisation côté extension :
  // on ne fait qu'oublier le compte localement.
  const disconnect = React.useCallback(() => {
    setAccount(null);
    setError(null);
    setOpen(false);
  }, []);

  const value = React.useMemo(
    () => ({
      account,
      chainId,
      onCorrectChain: chainId === activeChain.id,
      switchChain,
      pending,
      error,
      open,
      setOpen,
      connect,
      disconnect,
    }),
    [account, chainId, switchChain, pending, error, open, connect, disconnect]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
