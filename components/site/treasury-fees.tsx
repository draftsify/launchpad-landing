"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { encodeFunctionData, formatEther } from "viem";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/site/wallet-provider";
import {
  activeChain,
  explorerTx,
  gasWithBuffer,
  isDeployed,
  LAUNCHER_ADDRESS,
  publicClient,
} from "@/lib/chain";
import { launcherAbi, lockerAbi } from "@/lib/launcher";
import { parseAbi } from "viem";
import { formatTokens } from "@/lib/format";
import {
  readClaimable,
  readHoldings,
  readSplitsFees,
  readTreasury,
  type Claimable,
  type Holding,
} from "@/lib/onchain";
import { erc20Abi, POOL_FEE, routerAbi, uniswap } from "@/lib/uniswap";

/** WETH : `withdraw` rend l'ETH natif, un pour un, sans frais ni glissement. */
const wethAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function withdraw(uint256 amount)",
]);

/** Un montant en ETH lisible, tronqué plutôt qu'arrondi. */
function eth(wei: bigint, decimals = 4) {
  const [whole, frac = ""] = formatEther(wei).split(".");
  const cut = frac.slice(0, decimals).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

/**
 * Collecte des frais, dans la modale du wallet.
 *
 * Elle y est plutôt qu'à côté parce qu'une récompense se cherche là où l'on
 * regarde son compte. Un bouton séparé n'apparaissait qu'aux ayants droit,
 * donc personne ne savait qu'il pouvait exister : le créateur qui vient voir
 * son adresse trouve maintenant sa part sur le même écran.
 *
 * Deux publics depuis que le locker partage par côté : la trésorerie, qui reçoit
 * la quote, et les créateurs, qui reçoivent les tokens de leurs lancements. Le
 * panneau n'apparaît que pour eux — `collect` reste appelable par n'importe qui,
 * mais proposer « réclamer » à un visiteur laisserait croire qu'une part lui
 * revient.
 *
 * Ce qui rend la trésorerie automatique : une seule transaction paie les deux
 * destinataires. Un créateur qui réclame sa part verse la quote au protocole
 * sans même le savoir, et le protocole n'a rien à déclencher.
 *
 * Les montants viennent d'une simulation de `collect`, pas de `owedRecorded` :
 * le PositionManager n'inscrit les frais dus qu'au moment où on touche la
 * position, donc la vue rend zéro tant que personne n'a collecté, quel qu'ait
 * été le volume.
 */
export function FeesPanel() {
  const { account, onCorrectChain, switchChain } = useWallet();
  const [treasury, setTreasury] = useState<`0x${string}` | null>(null);
  const [rows, setRows] = useState<Claimable[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; hash?: string } | null>(null);
  /** WETH détenu par le wallet connecté, s'il y en a. */
  const [wrapped, setWrapped] = useState<{ token: `0x${string}`; balance: bigint } | null>(
    null
  );
  /** Les tokens recus en frais, avec ce qui peut sortir maintenant. */
  const [holdings, setHoldings] = useState<Holding[]>([]);
  /** Le locker déployé partage-t-il les frais par côté ? */
  const [splits, setSplits] = useState(false);

  useEffect(() => {
    let alive = true;
    readSplitsFees()
      .then((found) => alive && setSplits(found))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    readTreasury()
      .then((found) => alive && setTreasury(found))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const isTreasury =
    !!account && !!treasury && account.toLowerCase() === treasury.toLowerCase();

  const refresh = useCallback(() => {
    if (!account) return;
    setRows(null);
    readClaimable()
      .then(setRows)
      .catch(() => setRows([]));

    /**
     * Le WETH du wallet, parce que c'est ce que la collecte rend.
     *
     * Uniswap règle ses frais dans les deux jetons de la paire, donc la part
     * « ETH » arrive en **WETH** : un ERC-20, que MetaMask n'affiche pas tant
     * qu'on ne l'a pas ajouté. Une collecte réussie ressemble donc à une
     * collecte sans effet. Le solde est affiché ici, et un bouton le
     * déballe.
     */
    publicClient
      .readContract({
        address: LAUNCHER_ADDRESS as `0x${string}`,
        abi: launcherAbi,
        functionName: "quote",
      })
      .then(async (token) => {
        const balance = await publicClient.readContract({
          address: token,
          abi: wethAbi,
          functionName: "balanceOf",
          args: [account as `0x${string}`],
        });
        setWrapped({ token, balance });
      })
      .catch(() => setWrapped(null));

    readHoldings(account as `0x${string}`)
      .then(setHoldings)
      .catch(() => setHoldings([]));
  }, [account]);

  /**
   * Ramène en WETH la part vendable d'un token reçu en frais.
   *
   * Pourquoi ce n'est pas fait par le contrat, alors que ce serait plus simple :
   * les tokens de frais ouvrent une position comme n'importe quel achat, donc
   * un dixième seulement est vendable à l'instant de la collecte. Pour tout
   * convertir en une transaction, le protocole devrait s'exempter de sa propre
   * règle — c'est-à-dire vendre d'un coup ce qu'il empêche tout le monde de
   * vendre d'un coup. La contrainte ne dure qu'un quart d'heure ; on attend.
   */
  async function sellToEth(holding: Holding) {
    const provider = window.ethereum;
    if (!provider || !account || !uniswap || holding.releasable === 0n) return;
    if (!onCorrectChain && !(await switchChain())) return;

    setNote(null);
    setBusy(`sell:${holding.address}`);
    try {
      const from = account as `0x${string}`;
      const allowance = await publicClient.readContract({
        address: holding.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [from, uniswap.router],
      });

      if (allowance < holding.releasable) {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [uniswap.router, holding.releasable],
        });
        const gas = await gasWithBuffer({ account: from, to: holding.address, data });
        const hash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            { from, to: holding.address, data, gas: `0x${gas.toString(16)}` },
          ],
        })) as `0x${string}`;
        await publicClient.waitForTransactionReceipt({ hash });
      }

      const quoteToken = await publicClient.readContract({
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
            tokenOut: quoteToken,
            fee: POOL_FEE,
            recipient: from,
            amountIn: holding.releasable,
            // La trésorerie encaisse ce que le marché donne : refuser une
            // exécution ferait rester les tokens, ce qui est le contraire du
            // but. C'est un balayage de frais, pas une prise de position.
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
            ? "Sold. Unwrap below to get native ETH."
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

  async function unwrap() {
    const provider = window.ethereum;
    if (!provider || !account || !wrapped || wrapped.balance === 0n) return;
    if (!onCorrectChain && !(await switchChain())) return;

    setNote(null);
    setBusy("unwrap");
    try {
      const data = encodeFunctionData({
        abi: wethAbi,
        functionName: "withdraw",
        args: [wrapped.balance],
      });
      const gas = await gasWithBuffer({
        account: account as `0x${string}`,
        to: wrapped.token,
        data,
      });
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          { from: account, to: wrapped.token, data, gas: `0x${gas.toString(16)}` },
        ],
      })) as `0x${string}`;

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setNote({
        text:
          receipt.status === "success"
            ? "Unwrapped to native ETH."
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function collect(token: `0x${string}`) {
    const provider = window.ethereum;
    if (!provider || !account) return;
    if (!onCorrectChain && !(await switchChain())) return;

    setNote(null);
    setBusy(token);
    try {
      const locker = await publicClient.readContract({
        address: LAUNCHER_ADDRESS as `0x${string}`,
        abi: launcherAbi,
        functionName: "locker",
      });
      const data = encodeFunctionData({
        abi: lockerAbi,
        functionName: "collect",
        args: [token],
      });
      const gas = await gasWithBuffer({
        account: account as `0x${string}`,
        to: locker,
        data,
      });

      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          { from: account, to: locker, data, gas: `0x${gas.toString(16)}` },
        ],
      })) as `0x${string}`;

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setNote({
        text: receipt.status === "success" ? "Collected." : "The transaction reverted.",
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

  /**
   * Qui voit ce bouton, et pourquoi.
   *
   * `collect` est permissionless dans le contrat — la collecte ne doit dépendre
   * de personne — mais l'interface ne le propose qu'à ceux à qui une collecte
   * verse quelque chose : la trésorerie, et les créateurs depuis que le locker
   * partage par côté. Le proposer à un visiteur laisserait croire qu'une part
   * lui revient.
   *
   * Sur le locker précédent, `splits` est faux et seule la trésorerie le voit :
   * c'est la vérité de ce contrat-là.
   */
  const mine =
    rows?.filter(
      (row) =>
        !!account && splits && row.creator.toLowerCase() === account.toLowerCase()
    ) ?? [];
  const isCreator = mine.length > 0;

  if (!isDeployed || (!isTreasury && !isCreator)) return null;

  // La trésorerie voit tous les lancements ; un créateur ne voit que les siens.
  const visible = isTreasury ? (rows ?? []) : mine;
  const pending = visible.reduce((sum, row) => sum + row.quote, 0n);
  const withFees = visible.filter((row) => row.quote > 0n || row.token > 0n);
  // Rien à collecter, et rien à déballer : pas de bouton pour rien. Le WETH
  // compte, sinon le bouton disparaîtrait juste après une collecte réussie —
  // au moment précis où il faut pouvoir en faire quelque chose.
  const hasWrapped = (wrapped?.balance ?? 0n) > 0n;
  if (rows !== null && withFees.length === 0 && !hasWrapped && holdings.length === 0)
    return null;

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {isTreasury ? "Protocol fees" : "Creator rewards"}
          {isTreasury && rows !== null && (
            <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
              {eth(pending)} ETH
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {splits ? (
            isTreasury ? (
              <>
                Swap fees accrued to each locked position. Uniswap charges on
                whichever side goes in, so buys pay in ETH and sells pay in the
                token — the quote comes here, the tokens go to whoever launched
                it. Collecting is permissionless: one transaction pays both,
                whoever sends it.
              </>
            ) : (
              <>
                Every sell in your pool pays a fee in your token, and that side
                is yours. Claiming also pays the treasury its ETH side in the
                same transaction — the two are collected together, and cannot be
                separated.
              </>
            )
          ) : (
            <>
              Swap fees accrued to each locked position. Collecting always pays
              the treasury written into the locker&apos;s constructor, never the
              caller — this only triggers it, and so could anyone.
            </>
          )}
          {treasury && isTreasury && (
            <>
              {" "}
              Treasury:{" "}
              <span className="font-mono text-[11px] break-all">
                {treasury}
              </span>{" "}
              — the wallet you are connected with.
            </>
          )}
        </p>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Reading {activeChain.name}…
        </div>
      ) : withFees.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Nothing to collect yet. Fees appear here as soon as a pool is traded.
        </p>
      ) : (
        <ul className="space-y-2">
          {withFees.map((row) => (
            <li
              key={row.address}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">
                  {row.name}{" "}
                  <span className="text-muted-foreground">{row.symbol}</span>
                </p>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {eth(row.quote, 6)} ETH → treasury
                </p>
                {row.token > 0n && (
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    {formatTokens(Number(row.token) / 1e18)} {row.symbol} →{" "}
                    {splits
                      ? account &&
                        row.creator.toLowerCase() === account.toLowerCase()
                        ? "you"
                        : "creator"
                      : "treasury"}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => collect(row.address)}
              >
                {busy === row.address ? (
                  <Loader2 className="animate-spin" />
                ) : isTreasury ? (
                  "Collect"
                ) : (
                  "Claim"
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}

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

      {holdings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Fee tokens held</p>
          {holdings.map((holding) => {
            const locked = holding.balance - holding.releasable;
            return (
              <div
                key={holding.address}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">
                    {formatTokens(Number(holding.balance) / 1e18)}{" "}
                    <span className="text-muted-foreground">
                      {holding.symbol}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {locked > 0n
                      ? `${formatTokens(Number(holding.releasable) / 1e18)} sellable now — the rest opens within fifteen minutes of the collection.`
                      : "Fully unlocked."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="card"
                  disabled={busy !== null || holding.releasable === 0n}
                  onClick={() => sellToEth(holding)}
                >
                  {busy === `sell:${holding.address}` ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Sell to ETH"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {wrapped && wrapped.balance > 0n && (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {eth(wrapped.balance, 6)} WETH in this wallet
              </p>
              <p className="text-xs text-muted-foreground">
                Wrapped ETH is an ERC-20, so a wallet only shows it once the
                token is added. This is where a collection lands.
              </p>
            </div>
            <Button size="sm" disabled={busy !== null} onClick={unwrap}>
              {busy === "unwrap" ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Unwrap"
              )}
            </Button>
          </div>
          <p className="font-mono text-[11px] break-all text-muted-foreground">
            {wrapped.token}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {isTreasury
          ? "Fees are paid in both sides of the pair, so a collection returns wrapped ETH and tokens. The tokens land as an ordinary position — the protocol is subject to its own unlock schedule, a tenth at once and all of it fifteen minutes later."
          : "Your tokens land as an ordinary position, under the same unlock schedule as everyone else: a tenth sellable at once, all of it fifteen minutes later. Nobody is exempt from the rule, not even the person who wrote it."}
      </p>
    </div>
  );
}
