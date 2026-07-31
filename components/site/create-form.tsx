"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Globe,
  ImagePlus,
  Info,
  MessageCircle,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { formatEther, parseEther } from "viem";

import { Button } from "@/components/ui/button";
import { XIcon } from "@/components/x-icon";
import { useRules } from "@/components/site/use-rules";
import { WalletDialog } from "@/components/site/wallet-dialog";
import {
  activeChain,
  explorerAddress,
  explorerTx,
  gasWithBuffer,
  isDeployed,
  LAUNCHER_ADDRESS,
} from "@/lib/chain";
import { launchCall, tokenFromReceipt, waitForLaunch } from "@/lib/launcher";
import {
  byteLength,
  MAX_METADATA_BYTES,
  shrinkImage,
  toDataUri,
} from "@/lib/metadata";
import { useWallet } from "@/components/site/wallet-provider";
import { CREATOR_BUY_MAX_PERCENT, formatDuration } from "@/lib/presets";
import { readCreatorBuyCap } from "@/lib/onchain";
import { estimateCreatorBuy, maxCreatorBuyQuote } from "@/lib/uniswap";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const MAX_DESCRIPTION = 280;

/**
 * La supply d'un lancement, en wei. Identique pour tous — c'est une immuable du
 * launcher, pas un choix du créateur — donc la recopier ici ne peut pas
 * diverger sans qu'un redéploiement l'ait décidé. Sert à exprimer l'achat du
 * créateur en part de la supply avant que le token existe.
 */
const SUPPLY_GUESS = 1_000_000_000n * 10n ** 18n;

/**
 * Un montant en ETH lisible, tronqué et jamais arrondi.
 *
 * La troncature n'est pas cosmétique : ce nombre remplit le bouton « Max », et
 * un arrondi vers le haut le placerait au-dessus du plafond — le lancement
 * entier échouerait, pour un affichage plus joli.
 */
function ethLabel(wei: bigint, decimals = 4) {
  const [whole, frac = ""] = formatEther(wei).split(".");
  const cut = frac.slice(0, decimals).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

/* ------------------------------- primitives ------------------------------ */

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-8 first:border-t-0 first:pt-0">
      <div className="space-y-1">
        <p className="font-mono text-[11px] text-muted-foreground">{step}</p>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  counter,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {counter && (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {counter}
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/60";

function PrefixInput({
  id,
  icon,
  prefix,
  suffix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  icon?: React.ReactNode;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-3 transition-colors focus-within:border-foreground/60">
      {icon && (
        <span aria-hidden className="shrink-0 text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
      )}
      {prefix && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <input
        id={id}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        {...props}
      />
      {suffix && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* --------------------------------- form ---------------------------------- */

export function CreateForm() {
  const { account, chainId, onCorrectChain, switchChain } = useWallet();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working"; step: string }
    | { kind: "done"; hash: string; token?: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const reduce = useReducedMotion();
  // Ce que ce lancement subira vraiment, lu sur le launcher.
  const rules = useRules();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");

  const [devBuyOn, setDevBuyOn] = useState(false);
  const [devBuy, setDevBuy] = useState("");

  /**
   * Le plafond vient du launcher, pas d'ici — et sa seule lisibilité dit si ce
   * launcher connaît le dev buy.
   *
   * `creatorBuyCap()` n'existe pas sur un launcher antérieur : l'appel échoue,
   * et l'onglet reste caché. C'est ce qui permet de déployer cette interface
   * sans attendre le contrat — proposer un bouton qui ne peut que revert serait
   * pire que de ne rien proposer. Le jour où le launcher répond, l'onglet
   * apparaît de lui-même.
   */
  const [cap, setCap] = useState<bigint | null>(null);
  useEffect(() => {
    let alive = true;
    readCreatorBuyCap()
      .then((onchain) => {
        if (alive && onchain && onchain > 0n) setCap(onchain);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const devBuySupported = cap !== null;

  const maxDevBuyWei = maxCreatorBuyQuote(cap ?? 0n);
  // Une saisie en cours — « 0. », « », « abc » — ne doit pas casser le rendu.
  const devBuyWei = (() => {
    if (!devBuyOn || !devBuySupported) return 0n;
    try {
      const parsed = parseEther(devBuy.trim() || "0");
      return parsed > 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  })();
  const devBuyEstimate = estimateCreatorBuy(devBuyWei);
  const devBuyShare = Number(devBuyEstimate) / Number(SUPPLY_GUESS) * 100;
  const devBuyTooLarge = devBuyWei > maxDevBuyWei;

  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  // L'aperçu vit sur un blob local : sans révocation, chaque changement
  // d'image laisserait l'ancienne en mémoire jusqu'au rechargement.
  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    try {
      // Compressée dès la sélection : ce qui est prévisualisé est exactement
      // ce qui sera écrit dans le contrat, taille comprise.
      const thumbnail = await shrinkImage(file);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
      setImage(thumbnail);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not read that image",
      });
    }
  }

  async function deploy() {
    const provider = window.ethereum;
    if (!provider || !account) return;

    try {
      if (!onCorrectChain && !(await switchChain())) return;

      setStatus({ kind: "working", step: "Waiting for your signature" });
      const metadataURI = toDataUri({
        name: name.trim(),
        symbol: ticker.trim(),
        description,
        image: image ?? undefined,
        website,
        x,
        telegram,
        discord,
      });

      // Le contrat borne les métadonnées, et refuserait après la signature —
      // donc après que l'utilisateur a cru lancer. On le lui dit avant.
      if (byteLength(metadataURI) > MAX_METADATA_BYTES) {
        setStatus({
          kind: "error",
          message:
            "Metadata too large for on-chain storage. Shorten the description, or use a simpler image.",
        });
        return;
      }

      const { encodeFunctionData } = await import("viem");
      const call = launchCall(name.trim(), ticker.trim(), metadataURI, devBuyWei);
      const data = encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: [...call.args],
      });

      // Un lancement déploie un token, crée un pool et y écrit 120 slots
      // d'observations : près de 10 M de gas. C'est exactement le cas où
      // l'estimation d'un wallet tombe court et où la transaction meurt en
      // OutOfGas après avoir été signée.
      /**
       * L'estimation sert de simulation, et c'est elle qui garantit le dev buy.
       * Un achat au-dessus du plafond fait échouer le lancement *entier* — le
       * calcul affiché plus haut est une estimation, celui-ci s'exécute contre
       * l'état réel de la chaîne. Mieux vaut échouer ici que sur un token à
       * moitié lancé.
       */
      const gas = await gasWithBuffer({
        account: account as `0x${string}`,
        to: LAUNCHER_ADDRESS as `0x${string}`,
        data,
        value: devBuyWei,
      });

      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            to: LAUNCHER_ADDRESS,
            data,
            gas: `0x${gas.toString(16)}`,
            ...(devBuyWei > 0n
              ? { value: `0x${devBuyWei.toString(16)}` }
              : {}),
          },
        ],
      })) as `0x${string}`;

      setStatus({ kind: "working", step: "Deploying — waiting for the block" });
      const receipt = await waitForLaunch(hash);
      if (receipt.status !== "success") {
        setStatus({ kind: "error", message: "The transaction reverted." });
        return;
      }

      setStatus({
        kind: "done",
        hash,
        token: tokenFromReceipt(receipt)?.token,
      });
    } catch (err) {
      const message =
        (err as { shortMessage?: string })?.shortMessage ??
        (err as Error)?.message ??
        "Something went wrong";
      setStatus({ kind: "error", message: message.slice(0, 160) });
    }
  }

  const working = status.kind === "working";
  // Un dev buy au-dessus du plafond ferait échouer le lancement entier, donc il
  // bloque le bouton plutôt que la transaction.
  const canSubmit =
    name.trim().length > 0 && ticker.trim().length > 0 && !devBuyTooLarge;
  // Le libellé et l'état désactivé doivent découler de la même condition :
  // proposer « changer de réseau » sur un bouton grisé n'a aucun sens.
  const needsChain = isDeployed && chainId !== null && !onCorrectChain;
  /**
   * Le libellé porte le montant du dev buy quand il y en a un.
   *
   * C'est le dernier endroit qu'on lit avant de signer, et la seule chose que
   * cette transaction dépense au-delà du gas. Un bouton qui dit « Launch token »
   * alors qu'il va sortir 0,01 ETH du wallet cache la partie qui coûte.
   */
  const ctaLabel = working
    ? status.step
    : needsChain
      ? `Switch to ${activeChain.name}`
      : devBuyWei > 0n
        ? `Launch + buy ${ethLabel(devBuyWei, 6)} ETH`
        : "Launch token";
  const metadataBytes = byteLength(
    toDataUri({
      name: name.trim(),
      symbol: ticker.trim(),
      description,
      image: image ?? undefined,
      website,
      x,
      telegram,
      discord,
    })
  );

  const displayName = name.trim() || "Your token";
  const displayTicker = ticker.trim() || "TICKER";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,340px)] lg:gap-12">
      <form
        className="space-y-8"
        onSubmit={(e) => e.preventDefault()}
        noValidate
      >
        <Section
          step="01"
          title="Identity"
          hint="Everything here is written on chain at deployment and cannot be edited afterwards."
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="shrink-0">
              <input
                ref={fileRef}
                id="token-image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
              <label
                htmlFor="token-image"
                className={cn(
                  "flex size-28 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-dashed text-center transition-colors hover:border-foreground/30 hover:bg-muted/50",
                  image && "border-solid"
                )}
              >
                {image ? (
                  // Blob local, hors des domaines connus de next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <>
                    <ImagePlus className="size-5 text-muted-foreground" />
                    <span className="px-2 text-[11px] text-muted-foreground">
                      Add image
                    </span>
                  </>
                )}
              </label>
              {image && (
                <button
                  type="button"
                  onClick={() => {
                    if (objectUrl.current)
                      URL.revokeObjectURL(objectUrl.current);
                    objectUrl.current = null;
                    setImage(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Trash2 className="size-3" />
                  Remove
                </button>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <Field label="Name" htmlFor="token-name">
                <input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 32))}
                  placeholder="Reveal"
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Ticker"
                htmlFor="token-ticker"
                hint="Uppercase, up to 10 characters."
              >
                <PrefixInput
                  id="token-ticker"
                  icon={null}
                  prefix="$"
                  value={ticker}
                  // Mise en majuscules dans le champ lui-même : l'aperçu
                  // affichait déjà le ticker en majuscules, laisser la saisie
                  // en minuscules donnait deux vérités à l'écran.
                  onChange={(e) =>
                    setTicker(
                      e.target.value
                        .replace(/[^a-zA-Z0-9]/g, "")
                        .toUpperCase()
                        .slice(0, 10)
                    )
                  }
                  placeholder="REVEAL"
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>

          <Field
            label="Description"
            htmlFor="token-description"
            counter={`${description.length}/${MAX_DESCRIPTION}`}
          >
            <textarea
              id="token-description"
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, MAX_DESCRIPTION))
              }
              rows={3}
              placeholder="What is this token for?"
              className="w-full resize-y rounded-xl border bg-card px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/60"
            />
          </Field>
        </Section>

        <Section
          step="02"
          title="Links"
          hint="Optional, but a launch without them is hard to trust."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website" htmlFor="link-website">
              <PrefixInput
                id="link-website"
                icon={<Globe />}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="reveal.xyz"
                inputMode="url"
              />
            </Field>
            <Field label="X" htmlFor="link-x">
              <PrefixInput
                id="link-x"
                icon={<XIcon />}
                prefix="@"
                value={x}
                onChange={(e) => setX(e.target.value.replace(/^@/, ""))}
                placeholder="reveal"
              />
            </Field>
            <Field label="Telegram" htmlFor="link-telegram">
              <PrefixInput
                id="link-telegram"
                icon={<Send />}
                prefix="t.me/"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="reveal"
              />
            </Field>
            <Field label="Discord" htmlFor="link-discord">
              <PrefixInput
                id="link-discord"
                icon={<MessageCircle />}
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                placeholder="discord.gg/reveal"
              />
            </Field>
          </div>
        </Section>

        <Section
          step="03"
          title="Selling rules"
          hint="Identical for every launch on Reveal, and not yours to change. Letting each creator pick how constrained they are would make two tokens incomparable."
        >
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {[
              ["Sellable at launch", `${rules.initialUnlock}%`],
              ["Fully unlocked after", formatDuration(rules.unlockHours)],
              ["Buy ramp", `${rules.buyRamp} min`],
              ["First buy opens", `${rules.launchDelay}s after deploy`],
            ].map(([label, value]) => (
              <div key={label} className="space-y-1">
                <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {label}
                </dt>
                <dd className="font-mono text-sm tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-xs text-muted-foreground">
            A position also opens faster when it is underwater: half the entry
            price releases it entirely, whatever the clock says.
          </p>
        </Section>

        {devBuySupported && (
        <Section
          step="04"
          title="Dev buy"
          hint="Buy your own token in the launch transaction, before anyone else can. This is the one privilege the protocol grants, so it is stated rather than hidden."
        >
          <div
            role="tablist"
            aria-label="Dev buy"
            className="inline-flex rounded-xl border bg-muted/30 p-1"
          >
            {[
              { id: false, label: "No dev buy" },
              { id: true, label: "Dev buy" },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={devBuyOn === tab.id}
                onClick={() => setDevBuyOn(tab.id)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm transition-colors",
                  devBuyOn === tab.id
                    ? "bg-card font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {devBuyOn ? (
            <div className="space-y-4">
              <Field label="Amount to spend" htmlFor="dev-buy">
                <div className="flex items-center gap-2">
                  <PrefixInput
                    id="dev-buy"
                    inputMode="decimal"
                    value={devBuy}
                    onChange={(e) => setDevBuy(e.target.value)}
                    placeholder="0.02"
                    suffix="ETH"
                  />
                  <Button
                    type="button"
                    variant="card"
                    onClick={() => setDevBuy(ethLabel(maxDevBuyWei))}
                  >
                    Max
                  </Button>
                </div>
              </Field>

              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {[
                  [
                    "You would receive",
                    devBuyWei > 0n
                      ? `≈ ${formatTokens(Number(devBuyEstimate) / 1e18)}`
                      : "—",
                  ],
                  [
                    "Share of supply",
                    devBuyWei > 0n ? `≈ ${devBuyShare.toFixed(2)}%` : "—",
                  ],
                  ["Most you may buy", `${ethLabel(maxDevBuyWei)} ETH`],
                  ["Cap on that", `${CREATOR_BUY_MAX_PERCENT}% of supply`],
                ].map(([label, value]) => (
                  <div key={label} className="space-y-1">
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      {label}
                    </dt>
                    <dd className="font-mono text-sm tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

              {devBuyTooLarge && (
                <p className="text-xs text-destructive">
                  Over the cap. Above {ethLabel(maxDevBuyWei)} ETH the whole
                  launch reverts, not just the buy — lower the amount.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                What this buys you is order, not exemption. Your tokens follow
                the same schedule as everyone else&apos;s:{" "}
                {rules.initialUnlock}% sellable immediately, all of it after{" "}
                {formatDuration(rules.unlockHours)}. You pay the going price and
                move it for the buyers behind you.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              The pool opens with the entire supply and no quote in it, so
              launching costs you gas and nothing else. The first buyer sets the
              first price — and it can be someone other than you.
            </p>
          )}
        </Section>
        )}
      </form>

      {/* ------------------------------ preview ----------------------------- */}

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          {/* Action principale en tête du panneau : elle reste atteignable
              sans avoir à parcourir le récapitulatif. */}
          <div className="space-y-2">
            {!account ? (
              <WalletDialog>
                <Button className="w-full">
                  <Wallet />
                  Connect wallet to launch
                </Button>
              </WalletDialog>
            ) : (
              <Button
                className="w-full"
                onClick={deploy}
                disabled={working || !isDeployed || (!needsChain && !canSubmit)}
              >
                {ctaLabel}
              </Button>
            )}

            {/* Ce que la transaction sort du wallet, à côté du bouton qui la
                signe — pas seulement dans la section qui l'a réglé. */}
            {devBuyWei > 0n && !devBuyTooLarge && (
              <div className="space-y-1 rounded-xl border bg-muted/30 p-3 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">Dev buy</span>
                  <span className="font-mono tabular-nums">
                    {ethLabel(devBuyWei, 6)} ETH
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">You receive</span>
                  <span className="font-mono tabular-nums">
                    ≈ {formatTokens(Number(devBuyEstimate) / 1e18)} (
                    {devBuyShare.toFixed(2)}%)
                  </span>
                </div>
                <p className="pt-1 text-muted-foreground">
                  Locked like any other buy: {rules.initialUnlock}% sellable at
                  once, all of it after {formatDuration(rules.unlockHours)}.
                </p>
              </div>
            )}

            {status.kind === "done" ? (
              <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3">
                <p className="text-xs font-medium">Launched.</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {status.token && explorerAddress(status.token) && (
                    <a
                      href={explorerAddress(status.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Token contract
                    </a>
                  )}
                  {explorerTx(status.hash) && (
                    <a
                      href={explorerTx(status.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      Transaction
                    </a>
                  )}
                </div>
              </div>
            ) : status.kind === "error" ? (
              <p role="alert" className="text-xs text-foreground">
                {status.message}
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info aria-hidden className="mt-0.5 size-3 shrink-0" />
                {!isDeployed
                  ? `Launching is off: no RevealLauncher is deployed on ${activeChain.name} yet. Deploy the contracts, then set NEXT_PUBLIC_LAUNCHER.`
                  : `Metadata is written into the contract itself (${metadataBytes} bytes). You pay gas.`}
              </p>
            )}
          </div>

          <p className="border-t pt-4 text-[11px] tracking-wide text-muted-foreground uppercase">
            Live preview
          </p>

          <div className="flex items-start gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted/50">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="size-full object-cover" />
              ) : (
                <Image
                  src="/logo.png"
                  alt=""
                  width={512}
                  height={287}
                  className="h-5 w-auto opacity-25"
                />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate font-medium",
                  !name && "text-muted-foreground"
                )}
              >
                {displayName}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                ${displayTicker}
              </p>
              {description && (
                <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Sellable at launch
              </span>
              <span className="font-mono text-xs tabular-nums">
                {rules.initialUnlock}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-foreground/70"
                initial={false}
                animate={{ width: `${rules.initialUnlock}%` }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.4, ease: EASE }
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Reaches 100% after {formatDuration(rules.unlockHours)}, sooner if
              the position is underwater. Once unlocked, it is an ordinary
              ERC-20 balance — no cap, no window.
            </p>
          </div>

          <dl className="space-y-1.5 border-t pt-4 text-xs">
            {[
              ["Your cost", "Gas only"],
              ["First buy opens", `${rules.launchDelay}s after deploy`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-mono tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
