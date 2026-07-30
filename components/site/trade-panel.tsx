"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ExternalLink, Loader2, Wallet } from "lucide-react";
import { encodeFunctionData, formatEther, parseEther } from "viem";

import { activeChain, explorerTx, gasWithBuffer, publicClient } from "@/lib/chain";
import { formatTokens } from "@/lib/format";
import { tokenAbi } from "@/lib/launcher";
import type { Launch } from "@/lib/onchain";
import { RULES } from "@/lib/presets";
import {
  erc20Abi,
  POOL_FEE,
  quote,
  routerAbi,
  uniswap,
} from "@/lib/uniswap";
import { Button } from "@/components/ui/button";
import { WalletDialog } from "@/components/site/wallet-dialog";
import { useWallet } from "@/components/site/wallet-provider";
import { cn } from "@/lib/utils";

type Side = "buy" | "sell";
type Status =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "done"; hash: `0x${string}` }
  | { kind: "error"; message: string };

const MAX_UINT = (1n << 256n) - 1n;

/**
 * Achat et vente contre le pool du token.
 *
 * Deux choses gouvernent ce composant.
 *
 * D'abord, Uniswap emballe les transferts : un refus de nos règles remonte en
 * « TF », jamais en `PositionLocked`. Lire l'échec après coup n'apprendrait donc
 * rien à l'utilisateur. Tout ce qui contraint la vente est lu *avant* —
 * `sellableNow` dit le montant exact qui passe, et c'est celui-là qu'on propose.
 *
 * Ensuite, le routeur enveloppe l'ETH lui-même quand l'entrée est le WETH et
 * qu'il reçoit de la valeur. Acheter ne demande donc aucune approbation ; seule
 * la vente en exige une, sur le token.
 */
export function TradePanel({ launch, onDone }: { launch: Launch; onDone?: () => void }) {
  const { account, onCorrectChain, chainId, switchChain } = useWallet();
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const [balance, setBalance] = useState<bigint | null>(null);
  const [sellable, setSellable] = useState<bigint | null>(null);
  const [unlocked, setUnlocked] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [out, setOut] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);

  const opensAt = launch.launchedAt + RULES.launchDelay;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const notOpenYet = now < opensAt;

  const refresh = useCallback(async () => {
    if (!account || !uniswap) return;
    const holder = account as `0x${string}`;
    try {
      const [bal, sell, unl, allow] = await Promise.all([
        publicClient.readContract({
          address: launch.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [holder],
        }),
        publicClient.readContract({
          address: launch.address,
          abi: tokenAbi,
          functionName: "sellableNow",
          args: [holder],
        }),
        publicClient.readContract({
          address: launch.address,
          abi: tokenAbi,
          functionName: "unlockedBps",
          args: [holder],
        }),
        publicClient.readContract({
          address: launch.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [holder, uniswap.router],
        }),
      ]);
      setBalance(bal);
      setSellable(sell);
      setUnlocked(unl);
      setAllowance(allow);
    } catch {
      // Position illisible : les vues restent vides plutôt que fausses.
    }
  }, [account, launch.address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 12_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Le devis vient du quoter, qui simule le swap pour de vrai : il traverse donc
  // les mêmes gardes, et rend null quand la transaction échouerait.
  useEffect(() => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || !uniswap) {
      setOut(null);
      return;
    }
    let alive = true;
    setQuoting(true);
    const id = setTimeout(async () => {
      const inWei = parseEther(amount as `${number}`);
      const result =
        side === "buy"
          ? await quote(launch.quoteToken, launch.address, inWei)
          : await quote(launch.address, launch.quoteToken, inWei);
      if (!alive) return;
      setOut(result);
      setQuoting(false);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [amount, side, launch.address, launch.quoteToken]);

  const onWrongChain = chainId !== null && !onCorrectChain;
  const inWei = (() => {
    try {
      return amount ? parseEther(amount as `${number}`) : 0n;
    } catch {
      return 0n;
    }
  })();

  const overSellable =
    side === "sell" && sellable !== null && inWei > sellable && inWei > 0n;
  const needsApproval =
    side === "sell" && allowance !== null && inWei > allowance && inWei > 0n;

  async function send() {
    if (!account || !uniswap) return;
    const eth = window.ethereum;
    if (!eth) return;

    try {
      const from = account as `0x${string}`;

      if (needsApproval) {
        setStatus({ kind: "working", step: "Approving the router" });
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [uniswap.router, MAX_UINT],
        });
        const gas = await gasWithBuffer({ account: from, to: launch.address, data });
        const hash = (await eth.request({
          method: "eth_sendTransaction",
          params: [
            { from, to: launch.address, data, gas: `0x${gas.toString(16)}` },
          ],
        })) as `0x${string}`;
        await publicClient.waitForTransactionReceipt({ hash });
        await refresh();
      }

      setStatus({ kind: "working", step: "Waiting for your signature" });
      const buying = side === "buy";

      /**
       * Le montant vendable se périme entre l'affichage et la signature, et il
       * peut *baisser* — pas seulement monter. Le relief est un plancher calé
       * sur la perte courante : si le prix remonte entre-temps, la part
       * débloquée redescend vers ce que le seul écoulement du temps autorise.
       * Un achat suffit à provoquer ça.
       *
       * Envoyer le montant lu une minute plus tôt donne alors un `STF` du
       * routeur, que l'utilisateur n'a aucun moyen d'interpréter. On relit donc,
       * et on garde une marge d'un bloc de dérive.
       */
      let amountIn = inWei;
      if (!buying) {
        const fresh = await publicClient.readContract({
          address: launch.address,
          abi: tokenAbi,
          functionName: "sellableNow",
          args: [from],
        });
        if (amountIn >= fresh) {
          amountIn = (fresh * 995n) / 1000n;
          setSellable(fresh);
        }
        if (amountIn === 0n) {
          setStatus({
            kind: "error",
            message:
              "Nothing is sellable at this instant — the unlock floor moved as the price recovered. Try again in a moment.",
          });
          return;
        }
      }

      const data = encodeFunctionData({
        abi: routerAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: buying ? launch.quoteToken : launch.address,
            tokenOut: buying ? launch.address : launch.quoteToken,
            fee: POOL_FEE,
            recipient: from,
            amountIn,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      // Le routeur enveloppe l'ETH lui-même : acheter n'a besoin d'aucun WETH au
      // préalable, ni d'aucune approbation.
      const value = buying ? amountIn : undefined;
      const gas = await gasWithBuffer({
        account: from,
        to: uniswap.router,
        data,
        value,
      });

      const hash = (await eth.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: uniswap.router,
            data,
            gas: `0x${gas.toString(16)}`,
            ...(value !== undefined ? { value: `0x${value.toString(16)}` } : {}),
          },
        ],
      })) as `0x${string}`;

      setStatus({ kind: "working", step: "Waiting for the block" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setStatus({
          kind: "error",
          message:
            "The swap reverted. Uniswap hides our reason — check the amount against what is sellable now.",
        });
        return;
      }
      setStatus({ kind: "done", hash });
      setAmount("");
      await refresh();
      onDone?.();
    } catch (err) {
      const message =
        (err as { shortMessage?: string })?.shortMessage ??
        (err as Error)?.message ??
        "Something went wrong";
      setStatus({ kind: "error", message: message.slice(0, 180) });
    }
  }

  if (!uniswap) {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="font-medium">Trading unavailable</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No Uniswap V3 router is known for {activeChain.name}. Trading needs one
          whose factory matches the launcher&apos;s.
        </p>
      </section>
    );
  }

  const working = status.kind === "working";
  const max = side === "buy" ? null : sellable;

  return (
    <section className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Trade</h3>
        <div className="inline-flex items-center rounded-full border bg-background p-0.5">
          {(["buy", "sell"] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSide(s);
                setAmount("");
                setStatus({ kind: "idle" });
              }}
              className={cn(
                "h-7 rounded-full px-3 text-sm capitalize transition-colors",
                side === s
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>You pay</span>
          {max !== null && (
            <button
              type="button"
              onClick={() => setAmount(formatEther(max))}
              className="transition-colors hover:text-foreground"
            >
              Sellable now: {formatTokens(Number(formatEther(max)))} ${launch.symbol}
            </button>
          )}
        </div>
        <div className="flex h-11 items-center gap-2 rounded-xl border bg-background px-3">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
            aria-label={side === "buy" ? "Amount in ETH" : `Amount in ${launch.symbol}`}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            {side === "buy" ? "ETH" : `$${launch.symbol}`}
          </span>
        </div>

        <div className="flex justify-center text-muted-foreground">
          <ArrowDown className="size-3.5" />
        </div>

        <div className="flex h-11 items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm">
            {quoting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : out !== null ? (
              side === "buy"
                ? formatTokens(Number(formatEther(out)))
                : formatEther(out).slice(0, 12)
            ) : (
              "—"
            )}
          </span>
          <span className="shrink-0 text-sm text-muted-foreground">
            {side === "buy" ? `$${launch.symbol}` : "ETH"}
          </span>
        </div>
      </div>

      {/* Tout ce qui empêcherait la transaction, dit avant de signer. */}
      <div className="space-y-1.5 text-xs">
        {notOpenYet && (
          <p className="text-muted-foreground">
            Trading opens in {opensAt - now}s — the anti-sniper delay is{" "}
            {RULES.launchDelay}s.
          </p>
        )}
        {overSellable && (
          <p className="text-foreground">
            Above what this position may release. The rules allow{" "}
            {formatTokens(Number(formatEther(sellable!)))} right now.
          </p>
        )}
        {out === null && inWei > 0n && !quoting && !overSellable && (
          <p className="text-muted-foreground">
            The pool refuses this size right now — the buy ramp or the impact cap
            is still closed on it. Try smaller.
          </p>
        )}
        {account && unlocked !== null && balance !== null && balance > 0n && (
          <p className="text-muted-foreground">
            Your position: {formatTokens(Number(formatEther(balance)))} $
            {launch.symbol}, {Number(unlocked) / 100}% unlocked.
          </p>
        )}
      </div>

      <div className="mt-auto space-y-2">
        {!account ? (
          <WalletDialog>
            <Button className="w-full">
              <Wallet />
              Connect wallet
            </Button>
          </WalletDialog>
        ) : onWrongChain ? (
          <Button className="w-full" onClick={() => switchChain()}>
            Switch to {activeChain.name}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={working || inWei <= 0n || overSellable || notOpenYet}
            onClick={send}
          >
            {working ? (
              <>
                <Loader2 className="animate-spin" />
                {status.step}
              </>
            ) : needsApproval ? (
              `Approve and ${side}`
            ) : (
              `${side === "buy" ? "Buy" : "Sell"} $${launch.symbol}`
            )}
          </Button>
        )}

        {status.kind === "error" && (
          <p className="text-xs text-muted-foreground">{status.message}</p>
        )}
        {status.kind === "done" && (
          <a
            href={explorerTx(status.hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Done — view transaction
            <ExternalLink className="size-3" />
          </a>
        )}
        <p className="text-[11px] text-muted-foreground">
          Routed through the chain&apos;s Uniswap V3 router. Reveal never holds
          your funds.
        </p>
      </div>
    </section>
  );
}
