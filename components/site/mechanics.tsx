"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Trois démonstrations manipulables plutôt que trois schémas figés : survoler
 * une valeur recalcule le graphe. Le lecteur teste la règle au lieu de la
 * croire sur parole.
 *
 * Chaque commande est un vrai bouton : le survol pilote l'aperçu, le clic
 * l'épingle, et le focus clavier fait exactement ce que fait le survol.
 */

function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onMouseEnter={() => onChange(option.id)}
            onFocus={() => onChange(option.id)}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-7 rounded-full border px-2.5 font-mono text-xs transition-colors",
              active
                ? "border-foreground/30 bg-foreground text-background"
                : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-5 rounded-2xl border bg-card p-5 transition-colors duration-300 hover:border-foreground/20",
        className
      )}
    >
      {children}
    </article>
  );
}

function Readout({ value, unit }: { value: string; unit: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-4xl font-medium tracking-tight">{value}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </p>
  );
}

function Caption({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="mt-auto space-y-1.5">
      <h2 className="font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* --------------------------------- 1 ------------------------------------ */

const TIME_STEPS = [
  { id: "0h", label: "0h", sellable: 10, x: 14 },
  { id: "6h", label: "6h", sellable: 34, x: 90 },
  { id: "12h", label: "12h", sellable: 58, x: 170 },
  { id: "24h", label: "24h", sellable: 100, x: 300 },
];

const CURVE = "M14,132 C 92,128 140,104 190,68 S 268,26 300,16";

function UnlockDemo() {
  const [step, setStep] = useState("6h");
  const reduce = useReducedMotion();
  const current = TIME_STEPS.find((s) => s.id === step) ?? TIME_STEPS[1];
  const y = 148 - (current.sellable / 100) * 132;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Sellable after
          </p>
          <Readout value={`${current.sellable}%`} unit="of the position" />
        </div>
        <Chips
          label="Time since launch"
          options={TIME_STEPS}
          value={step}
          onChange={setStep}
        />
      </div>

      <svg
        viewBox="0 0 320 168"
        role="img"
        aria-label={`After ${current.id}, ${current.sellable}% of a position is sellable`}
        className="h-auto w-full"
      >
        <defs>
          <linearGradient id="unlock-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
          </linearGradient>
          <clipPath id="unlock-clip">
            <motion.rect
              x="0"
              y="0"
              height="168"
              animate={{ width: current.x + 6 }}
              initial={false}
              transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE }}
            />
          </clipPath>
        </defs>

        <line x1="10" x2="310" y1="148" y2="148" stroke="var(--color-border)" />

        <path
          d={CURVE}
          fill="none"
          stroke="var(--color-foreground)"
          strokeOpacity="0.2"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <g clipPath="url(#unlock-clip)">
          <path d={`${CURVE} L300,148 L14,148 Z`} fill="url(#unlock-area)" />
          <path
            d={CURVE}
            fill="none"
            stroke="var(--color-foreground)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </g>

        <motion.g
          animate={{ x: current.x, y }}
          initial={false}
          transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE }}
        >
          <line y1="0" y2={148 - y} stroke="var(--color-border)" />
          <circle r="3.5" fill="var(--color-foreground)" />
        </motion.g>

        <text
          x="14"
          y="164"
          className="font-mono"
          fontSize="9"
          fill="var(--color-foreground)"
          fillOpacity="0.4"
        >
          launch
        </text>
        <text
          x="306"
          y="164"
          textAnchor="end"
          className="font-mono"
          fontSize="9"
          fill="var(--color-foreground)"
          fillOpacity="0.4"
        >
          24h
        </text>
      </svg>

      <Caption
        title="Selling opens progressively"
        body="A share of every position is sellable from the first block, and the rest unlocks steadily. Nobody is locked in, but nobody empties the pool in the first minute either."
      />
    </Card>
  );
}

/* --------------------------------- 2 ------------------------------------ */

const DRAWDOWN_TIERS = [
  { id: "0", label: "0%", sellable: 34, note: "no relief" },
  { id: "10", label: "−10%", sellable: 52, note: "tier 1" },
  { id: "20", label: "−20%", sellable: 71, note: "tier 2" },
  { id: "40", label: "−40%", sellable: 96, note: "tier 3" },
];

function DrawdownDemo() {
  const [tier, setTier] = useState("10");
  const reduce = useReducedMotion();
  const current = DRAWDOWN_TIERS.find((t) => t.id === tier) ?? DRAWDOWN_TIERS[1];

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Sellable at 6h
          </p>
          <Readout value={`${current.sellable}%`} unit={current.note} />
        </div>
        <Chips
          label="Position drawdown"
          options={DRAWDOWN_TIERS}
          value={tier}
          onChange={setTier}
        />
      </div>

      <ul className="space-y-1.5">
        {DRAWDOWN_TIERS.map((t) => {
          const active = t.id === current.id;
          return (
            <li
              key={t.id}
              className={cn(
                "relative overflow-hidden rounded-lg border px-3 py-2 transition-colors",
                active ? "border-foreground/25" : "border-border"
              )}
            >
              {/* La barre de fond porte la part vendable : le palier actif se
                  lit sans avoir à croiser une légende. */}
              <motion.span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0",
                  active ? "bg-foreground/15" : "bg-foreground/[0.05]"
                )}
                initial={false}
                animate={{ width: `${t.sellable}%` }}
                transition={
                  reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }
                }
              />
              <span className="relative flex items-center justify-between gap-3 text-sm">
                <span
                  className={cn(
                    "font-mono text-xs",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {t.label} price
                </span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {t.sellable}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <Caption
        title="Losses open the gate faster"
        body="If the price falls against a position, its unlock accelerates. The deeper the drawdown, the closer that position gets to fully liquid."
      />
    </Card>
  );
}

/* --------------------------------- 3 ------------------------------------ */

const SELL_SIZES = [
  { id: "05", label: "0.5%", size: 0.5 },
  { id: "1", label: "1%", size: 1 },
  { id: "2", label: "2%", size: 2 },
  { id: "5", label: "5%", size: 5 },
];

const CAP = 1;

function ImpactDemo() {
  const [size, setSize] = useState("2");
  const reduce = useReducedMotion();
  const current = SELL_SIZES.find((s) => s.id === size) ?? SELL_SIZES[2];
  const allowed = Math.min(current.size, CAP);
  const refused = Math.max(0, current.size - CAP);
  const scale = 5;

  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Executes now
          </p>
          <Readout
            value={`${allowed.toFixed(1)}%`}
            unit={
              refused > 0
                ? `of liquidity · ${refused.toFixed(1)}% waits for the next window`
                : "of liquidity · nothing held back"
            }
          />
        </div>
        <Chips
          label="Attempted sell size"
          options={SELL_SIZES}
          value={size}
          onChange={setSize}
        />
      </div>

      <div className="space-y-2">
        <div className="relative h-14 overflow-hidden rounded-xl border bg-muted/30">
          <motion.div
            className="absolute inset-y-0 left-0 bg-foreground/70"
            initial={false}
            animate={{ width: `${(allowed / scale) * 100}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }}
          />
          <motion.div
            className="absolute inset-y-0 border-y border-r border-dashed border-foreground/25 bg-foreground/[0.06]"
            initial={false}
            animate={{
              left: `${(allowed / scale) * 100}%`,
              width: `${(refused / scale) * 100}%`,
            }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }}
          />
          {/* Repère du plafond : il ne bouge pas, c'est la demande qui varie. */}
          <div
            aria-hidden
            className="absolute inset-y-0 w-px bg-foreground"
            style={{ left: `${(CAP / scale) * 100}%` }}
          />
          <span
            aria-hidden
            className="absolute top-1 font-mono text-[10px] text-foreground"
            style={{ left: `calc(${(CAP / scale) * 100}% + 6px)` }}
          >
            cap {CAP}%
          </span>
        </div>
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>{scale}% of pool liquidity</span>
        </div>
      </div>

      <Caption
        title="Impact is capped per window"
        body="Even fully unlocked, a wallet cannot move the pool beyond a set share within a time window. The excess is refused, not the trade — it stays available in the next window."
      />
    </Card>
  );
}

export function Mechanics() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <UnlockDemo />
      <DrawdownDemo />
      <ImpactDemo />
    </div>
  );
}
