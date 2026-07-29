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

import { Button } from "@/components/ui/button";
import { XIcon } from "@/components/x-icon";
import { WalletDialog } from "@/components/site/wallet-dialog";
import {
  activeChain,
  explorerAddress,
  explorerTx,
  isDeployed,
  LAUNCHER_ADDRESS,
} from "@/lib/chain";
import { launchCall, tokenFromReceipt, waitForLaunch } from "@/lib/launcher";
import { byteLength, shrinkImage, toDataUri } from "@/lib/metadata";
import { useWallet } from "@/components/site/wallet-provider";
import {
  RULES,
  formatDuration,
} from "@/lib/presets";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const MAX_DESCRIPTION = 280;

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
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  icon: React.ReactNode;
  prefix?: string;
}) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3 transition-colors focus-within:border-foreground/60">
      <span aria-hidden className="shrink-0 text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
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
    </div>
  );
}

/* --------------------------------- form ---------------------------------- */

export function CreateForm() {
  const { account, onCorrectChain, switchChain } = useWallet();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working"; step: string }
    | { kind: "done"; hash: string; token?: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const reduce = useReducedMotion();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");

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

      const { encodeFunctionData } = await import("viem");
      const call = launchCall(name.trim(), ticker.trim(), metadataURI);
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            to: LAUNCHER_ADDRESS,
            data: encodeFunctionData({
              abi: call.abi,
              functionName: call.functionName,
              args: [...call.args],
            }),
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
  const canSubmit = name.trim().length > 0 && ticker.trim().length > 0;
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
              ["Sellable at launch", `${RULES.initialUnlock}%`],
              ["Fully unlocked after", formatDuration(RULES.unlockHours)],
              [
                "Impact cap",
                `${RULES.impactCap}% / ${RULES.impactWindow} min`,
              ],
              ["First buy opens", `${RULES.launchDelay}s after deploy`],
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
                disabled={!isDeployed || !canSubmit || working}
              >
                {working ? status.step : !onCorrectChain ? `Switch to ${activeChain.name}` : "Launch token"}
              </Button>
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
                  ? "No launcher deployed yet — set NEXT_PUBLIC_LAUNCHER once it is."
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
                {RULES.initialUnlock}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-foreground/70"
                initial={false}
                animate={{ width: `${RULES.initialUnlock}%` }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.4, ease: EASE }
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Reaches 100% after {formatDuration(RULES.unlockHours)}. Capped at{" "}
              {RULES.impactCap}% of the pool's ETH per {RULES.impactWindow} min.
            </p>
          </div>

          <dl className="space-y-1.5 border-t pt-4 text-xs">
            {[
              ["Your cost", "Gas only"],
              ["First buy opens", `${RULES.launchDelay}s after deploy`],
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
