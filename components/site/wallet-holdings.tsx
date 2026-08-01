"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { encodeFunctionData } from "viem";

import { Button } from "@/components/ui/button";
import { TokenMark } from "@/components/site/token-mark";
import { useWallet } from "@/components/site/wallet-provider";
import {
  explorerTx,
  gasWithBuffer,
  isDeployed,
  LAUNCHER_ADDRESS,
  publicClient,
} from "@/lib/chain";
import { launcherAbi } from "@/lib/launcher";
import { formatTokens } from "@/lib/format";
import { readHoldings, type Holding } from "@/lib/onchain";
import { erc20Abi, POOL_FEE, routerAbi, uniswap } from "@/lib/uniswap";

/** Un montant de tokens, lisible. */
const amount = (value: bigint) => formatTokens(Number(value) / 1e18);

/**
 * Ce que le portefeuille connecté détient, et ce qu'il peut vendre maintenant.
 *
 * La question que ce panneau répond est la seule qui se pose vraiment sur ce
 * launchpad : « combien puis-je sortir tout de suite ». Elle avait une réponse
 * sur la page de chaque token, une par une, et nulle part pour l'ensemble — un
 * détenteur de trois lancements devait ouvrir trois pages pour additionner à la
 * main ce qu'il pouvait vendre.
 *
 * Les deux nombres viennent du token lui-même, `balanceOf` et `releasable` :
 * c'est le contrat qui décide ce qui sort, donc c'est lui qu'on interroge. Rien
 * n'est calculé ici à partir d'une heure de lancement, parce qu'une horloge de
 * navigateur et un horodatage de bloc ne sont pas la même chose.
 */
export function WalletHoldings() {
  const { account, onCorrectChain, switchChain } = useWallet();
  const [rows, setRows] = useState<Holding[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; hash?: string } | null>(
    null,
  );

  const refresh = useCallback(() => {
    if (!account || !isDeployed) return;
    readHoldings(account as `0x${string}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [account]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Vend, par le routeur canonique, exactement ce que le contrat libère.
   *
   * Demander le montant au token plutôt que de reprendre celui qui est affiché :
   * entre le rendu et la signature, une tranche a pu s'ouvrir, et surtout le
   * verrou se juge sur l'horodatage du bloc. Un chiffre d'écran vieux de trente
   * secondes ferait revert la transaction avec un motif que Uniswap emballe en
   * « TF », c'est-à-dire illisible.
   */
  async function sell(holding: Holding) {
    const provider = window.ethereum;
    if (!provider || !account || !uniswap) return;
    if (!onCorrectChain && !(await switchChain())) return;

    setNote(null);
    setBusy(holding.address);
    try {
      const from = account as `0x${string}`;
      const releasable = await publicClient.readContract({
        address: holding.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [from],
      });
      const sellable =
        releasable < holding.releasable ? releasable : holding.releasable;
      if (sellable === 0n) {
        setNote({ text: "Nothing is unlocked yet." });
        return;
      }

      const allowance = await publicClient.readContract({
        address: holding.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [from, uniswap.router],
      });
      if (allowance < sellable) {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [uniswap.router, sellable],
        });
        const gas = await gasWithBuffer({
          account: from,
          to: holding.address,
          data,
        });
        const hash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            { from, to: holding.address, data, gas: `0x${gas.toString(16)}` },
          ],
        })) as `0x${string}`;
        await publicClient.waitForTransactionReceipt({ hash });
      }

      const quote = await publicClient.readContract({
        address: LAUNCHER_ADDRESS as `0x${string}`,
        abi: launcherAbi,
        functionName: "quote",
      });
      const data = encodeFunctionData({
        abi: routerAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: holding.address,
            tokenOut: quote,
            fee: POOL_FEE,
            recipient: from,
            amountIn: sellable,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const gas = await gasWithBuffer({
        account: from,
        to: uniswap.router,
        data,
      });
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          { from, to: uniswap.router, data, gas: `0x${gas.toString(16)}` },
        ],
      })) as `0x${string}`;

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setNote({
        text:
          receipt.status === "success"
            ? "Sold. The proceeds arrive as wrapped ETH."
            : "The transaction reverted.",
        hash,
      });
      refresh();
    } catch (error) {
      const message =
        (error as { shortMessage?: string })?.shortMessage ??
        (error as Error)?.message ??
        "Something went wrong";
      setNote({ text: message.slice(0, 140) });
    } finally {
      setBusy(null);
    }
  }

  // Rien en portefeuille : pas de section vide. Le cas est le plus fréquent.
  if (!isDeployed || !account || rows === null || rows.length === 0)
    return null;

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <p className="text-sm font-medium">Your tokens</p>

      <ul className="space-y-2">
        {rows.map((holding) => (
          <li
            key={holding.address}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <TokenMark
                symbol={holding.symbol}
                image={holding.image}
                size="sm"
              />
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">
                  {amount(holding.balance)}{" "}
                  <span className="text-muted-foreground">
                    {holding.symbol}
                  </span>
                </p>
                {/* Le verrouillé est nommé plutôt que déduit d'une
                    soustraction : « 65.2K détenus, 6.5K vendables » laisse
                    calculer le reste de tête, ce que personne ne fait. */}
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {amount(holding.releasable)} sellable now
                  {holding.balance > holding.releasable &&
                    ` · ${amount(holding.balance - holding.releasable)} locked`}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="card"
              disabled={busy !== null || holding.releasable === 0n}
              onClick={() => sell(holding)}
            >
              {busy === holding.address ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Sell"
              )}
            </Button>
          </li>
        ))}
      </ul>

      {note && (
        <p className="text-xs text-muted-foreground">
          {note.text}{" "}
          {note.hash && explorerTx(note.hash) && (
            <a
              href={explorerTx(note.hash)}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Transaction
            </a>
          )}
        </p>
      )}

      {rows.some((row) => row.balance > row.releasable) && (
        <p className="text-xs text-muted-foreground">
          A tenth of a position opens at once and the rest fifteen minutes
          later, counted from when it was acquired. What is locked is locked for
          everyone, including whoever launched it.
        </p>
      )}
    </div>
  );
}
