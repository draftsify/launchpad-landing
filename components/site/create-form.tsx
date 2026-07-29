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
import { useWallet } from "@/components/site/wallet-provider";
import {
  LAUNCH_LIQUIDITY_ETH,
  PRESETS,
  formatDuration,
  type Rules,
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
  const { account } = useWallet();
  const reduce = useReducedMotion();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [rules, setRules] = useState<Rules>(PRESETS[0].rules);
  const [advanced, setAdvanced] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  // L'aperçu vit sur un blob local : sans révocation, chaque changement
  // d'image laisserait l'ancienne en mémoire jusqu'au rechargement.
  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  function pickImage(file: File | undefined) {
    if (!file) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setImage(url);
  }

  function applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setRules(preset.rules);
  }

  function editRule(key: keyof Rules, value: number) {
    setPresetId("custom");
    setRules((r) => ({ ...r, [key]: value }));
  }

  const displayName = name.trim() || "Your token";
  const displayTicker = ticker.trim() || "TICKER";
  const activePreset = PRESETS.find((p) => p.id === presetId);

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

        <Section step="03" title="Supply">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Total supply" htmlFor="token-supply">
              <input
                id="token-supply"
                value={supply}
                onChange={(e) =>
                  setSupply(e.target.value.replace(/[^0-9]/g, "").slice(0, 15))
                }
                inputMode="numeric"
                className={cn(inputClass, "font-mono tabular-nums")}
              />
            </Field>

            {/* Affiché sans être modifiable : le créateur ne le paie pas, mais
                c'est l'échelle contre laquelle son plafond d'impact se mesure —
                « 1 % de la liquidité » n'a de sens qu'avec ce référent. */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Initial liquidity</p>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-dashed bg-muted/30 px-3">
                <span className="font-mono text-xs text-muted-foreground">
                  ETH
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {LAUNCH_LIQUIDITY_ETH}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Provided by Reveal
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                The protocol seeds the pool and burns the LP tokens, so nobody
                can pull the liquidity out. You pay gas only.
              </p>
            </div>
          </div>
        </Section>

        <Section
          step="04"
          title="Selling rules"
          hint="The part no other launchpad asks you. These are immutable once deployed."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {PRESETS.map((preset) => {
              const active = preset.id === presetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-foreground/30 bg-muted"
                      : "bg-card hover:bg-muted/60"
                  )}
                >
                  <span className="block text-sm font-medium">
                    {preset.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {preset.summary}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {advanced ? "Hide" : "Show"} individual parameters
          </button>

          {advanced && (
            <motion.div
              initial={reduce ? undefined : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Field
                label="Sellable at launch"
                htmlFor="rule-initial"
                hint="Percent of every position, from the first block."
              >
                <PrefixInput
                  id="rule-initial"
                  icon={null}
                  prefix="%"
                  value={String(rules.initialUnlock)}
                  onChange={(e) =>
                    editRule("initialUnlock", Number(e.target.value) || 0)
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field
                label="Fully unlocked after"
                htmlFor="rule-duration"
                hint="Hours until a position reaches 100% sellable."
              >
                <PrefixInput
                  id="rule-duration"
                  icon={null}
                  prefix="h"
                  value={String(rules.unlockHours)}
                  onChange={(e) =>
                    editRule("unlockHours", Number(e.target.value) || 0)
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field
                label="Impact cap"
                htmlFor="rule-cap"
                hint="Max share of liquidity one wallet can move per window."
              >
                <PrefixInput
                  id="rule-cap"
                  icon={null}
                  prefix="%"
                  value={String(rules.impactCap)}
                  onChange={(e) =>
                    editRule("impactCap", Number(e.target.value) || 0)
                  }
                  inputMode="decimal"
                />
              </Field>
              <Field label="Impact window" htmlFor="rule-window">
                <PrefixInput
                  id="rule-window"
                  icon={null}
                  prefix="min"
                  value={String(rules.impactWindow)}
                  onChange={(e) =>
                    editRule("impactWindow", Number(e.target.value) || 0)
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field
                label="Launch delay"
                htmlFor="rule-delay"
                hint="Seconds before the first buy is accepted."
              >
                <PrefixInput
                  id="rule-delay"
                  icon={null}
                  prefix="s"
                  value={String(rules.launchDelay)}
                  onChange={(e) =>
                    editRule("launchDelay", Number(e.target.value) || 0)
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field
                label="Buy ramp"
                htmlFor="rule-ramp"
                hint="Minutes over which the max buy size grows."
              >
                <PrefixInput
                  id="rule-ramp"
                  icon={null}
                  prefix="min"
                  value={String(rules.buyRamp)}
                  onChange={(e) =>
                    editRule("buyRamp", Number(e.target.value) || 0)
                  }
                  inputMode="numeric"
                />
              </Field>
            </motion.div>
          )}
        </Section>
      </form>

      {/* ------------------------------ preview ----------------------------- */}

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          {/* Action principale en tête du panneau : elle reste atteignable
              sans avoir à parcourir le récapitulatif. */}
          <div className="space-y-2">
            {account ? (
              <Button className="w-full" disabled>
                Launch token
              </Button>
            ) : (
              <WalletDialog>
                <Button className="w-full">
                  <Wallet />
                  Connect wallet to launch
                </Button>
              </WalletDialog>
            )}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-3 shrink-0" />
              Deployment goes live with the contracts. Nothing on this page is
              submitted anywhere yet.
            </p>
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
              Reaches 100% after {formatDuration(rules.unlockHours)}. Capped at{" "}
              {rules.impactCap}% of liquidity per {rules.impactWindow} min.
            </p>
          </div>

          <dl className="space-y-1.5 border-t pt-4 text-xs">
            {[
              ["Preset", activePreset?.label ?? "Custom"],
              ["Supply", supply ? Number(supply).toLocaleString("en-US") : "—"],
              ["Liquidity", `${LAUNCH_LIQUIDITY_ETH} ETH — seeded`],
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
