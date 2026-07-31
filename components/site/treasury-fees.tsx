"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { encodeFunctionData, formatEther } from "viem";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { readClaimable, readTreasury, type Claimable } from "@/lib/onchain";

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
 * Collecte des frais du protocole, à côté du wallet.
 *
 * Visible seulement pour la trésorerie, et il faut être précis sur pourquoi :
 * `collect` est **permissionless**, donc n'importe qui peut le déclencher —
 * c'est délibéré, la collecte ne doit dépendre de personne. Mais elle envoie
 * toujours à l'adresse inscrite dans le constructeur du locker, jamais à qui
 * appelle. Un bouton « réclamer » proposé à tout visiteur laisserait croire que
 * quelque chose lui revient. Il n'apparaît donc que pour l'adresse concernée.
 *
 * Les montants viennent d'une simulation de `collect`, pas de `owedRecorded` :
 * le PositionManager n'inscrit les frais dus qu'au moment où on touche la
 * position, donc la vue rend zéro tant que personne n'a collecté, quel qu'ait
 * été le volume.
 */
export function TreasuryFees() {
  const { account, onCorrectChain, switchChain } = useWallet();
  const [treasury, setTreasury] = useState<`0x${string}` | null>(null);
  const [rows, setRows] = useState<Claimable[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; hash?: string } | null>(null);
  const [open, setOpen] = useState(false);
  /** WETH détenu par le wallet connecté, s'il y en a. */
  const [wrapped, setWrapped] = useState<{ token: `0x${string}`; balance: bigint } | null>(
    null
  );

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
    if (!isTreasury) return;
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
  }, [isTreasury, account]);

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
   * Réservé à la trésorerie.
   *
   * `collect` reste permissionless dans le contrat, et c'est une propriété
   * qu'on ne touche pas : la collecte ne doit dépendre de personne. Mais un
   * bouton « frais » à côté du wallet d'un créateur laisse entendre qu'une part
   * lui revient, et ce n'est pas le cas aujourd'hui — les frais vont
   * intégralement au protocole. Tant que ce partage n'existe pas, l'interface
   * ne doit pas le suggérer.
   *
   * Le jour où une part créateur existera, elle vivra dans le contrat, pas dans
   * la visibilité d'un bouton.
   */
  if (!isDeployed || !isTreasury) return null;

  const pending = rows?.reduce((sum, row) => sum + row.quote, 0n) ?? 0n;
  const withFees = rows?.filter((row) => row.quote > 0n || row.token > 0n) ?? [];
  // Rien à collecter, et rien à déballer : pas de bouton pour rien. Le WETH
  // compte, sinon le bouton disparaîtrait juste après une collecte réussie —
  // au moment précis où il faut pouvoir en faire quelque chose.
  const hasWrapped = (wrapped?.balance ?? 0n) > 0n;
  if (rows !== null && withFees.length === 0 && !hasWrapped) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="card" size="sm" onClick={refresh}>
          <Coins />
          {rows === null ? "Fees" : `${eth(pending)} ETH`}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Protocol fees</DialogTitle>
          <DialogDescription>
            Swap fees accrued to each locked position. Collecting always pays
            the treasury written into the locker&apos;s constructor, never the
            caller — this button only triggers it, and so could anyone.
            {treasury && (
              <>
                {" "}
                Here that is{" "}
                <span className="font-mono text-[11px] break-all">
                  {treasury}
                </span>
                {isTreasury ? " — the wallet you are connected with." : "."}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {rows === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Reading {activeChain.name}…
          </div>
        ) : withFees.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
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
                    {eth(row.quote, 6)} ETH
                    {row.token > 0n &&
                      ` · ${formatTokens(Number(row.token) / 1e18)} ${row.symbol}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => collect(row.address)}
                >
                  {busy === row.address ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Collect"
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
          Fees are paid in both sides of the pair, so a collection returns
          wrapped ETH and tokens. The tokens land as an ordinary position — the
          protocol is subject to its own unlock schedule, a tenth at once and
          all of it fifteen minutes later.
        </p>
      </DialogContent>
    </Dialog>
  );
}
