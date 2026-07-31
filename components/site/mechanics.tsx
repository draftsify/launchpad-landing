"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Un seul panneau plutôt que trois cartes : les trois règles ne répondent pas
 * à trois questions, elles se composent pour répondre à une seule — combien
 * puis-je vendre maintenant. Trois visuels distincts donnaient trois unités
 * différentes et affichaient deux fois le même chiffre.
 *
 * La barre représente une position ; ses trois zones correspondent exactement
 * aux trois règles.
 */

const TIME = [
  { id: "0h", label: "0h", unlocked: 10 },
  { id: "6h", label: "6h", unlocked: 34 },
  { id: "12h", label: "12h", unlocked: 58 },
  { id: "24h", label: "24h", unlocked: 100 },
];

const DRAWDOWN = [
  { id: "0", label: "0%", floor: 0 },
  { id: "10", label: "−10%", floor: 30 },
  { id: "20", label: "−20%", floor: 50 },
  { id: "40", label: "−40%", floor: 95 },
];

/**
 * Il y avait ici une troisième dimension — la taille de la position rapportée
 * au pool — parce qu'un plafond d'impact s'y mesurait. Ce plafond a été retiré
 * du protocole : la réserve qu'il prétendait mesurer n'est pas lisible depuis
 * un hook ERC-20, et celui annoncé à 10 % en laissait passer 17,3 %. Le
 * simulateur n'a plus que ce qui existe vraiment — le temps, et la perte.
 */

function Control({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="flex items-center gap-1">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              // Le survol prévisualise, le clic épingle, le focus clavier fait
              // exactement ce que fait le survol.
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
    </div>
  );
}

function Key({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", swatch)} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono text-xs tabular-nums">{value}</span>
    </div>
  );
}

export function Mechanics() {
  const [time, setTime] = useState("6h");
  const [drawdown, setDrawdown] = useState("0");
  const reduce = useReducedMotion();

  const t = TIME.find((o) => o.id === time) ?? TIME[1];
  const d = DRAWDOWN.find((o) => o.id === drawdown) ?? DRAWDOWN[0];

  // La protection en perte est un plancher, jamais un bonus qui s'ajoute.
  const unlocked = Math.max(t.unlocked, d.floor);

  // Plus rien ne s'interpose entre ce qui est débloqué et ce qui part : une
  // fois libérée, la quantité est un solde ERC-20 ordinaire.
  const executable = unlocked;
  const vesting = 100 - unlocked;

  const transition = reduce ? { duration: 0 } : { duration: 0.5, ease: EASE };

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,280px)] lg:gap-10">
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Sellable right now
              </p>
              <p className="flex items-baseline gap-2">
                <span className="text-4xl font-medium tracking-tight sm:text-5xl">
                  {executable}%
                </span>
                <span className="text-sm text-muted-foreground">
                  of the position
                </span>
              </p>
            </div>
            <p className="hidden text-right font-mono text-[11px] text-muted-foreground sm:block">
              time {t.unlocked}% · relief {d.floor}%
              <br />
              unlocked {unlocked}% of the position
            </p>
          </div>

          {/* Une position, trois zones — une par règle. */}
          <div>
            <div className="flex h-16 gap-0.5 overflow-hidden rounded-xl border bg-muted/20 p-0.5">
              <motion.div
                className="rounded-lg bg-foreground/75"
                initial={false}
                animate={{ width: `${executable}%` }}
                transition={transition}
              />
              <motion.div
                className="rounded-lg bg-foreground/[0.08]"
                initial={false}
                animate={{ width: `${vesting}%` }}
                transition={transition}
              />
            </div>

            <div className="mt-3 grid gap-1.5 sm:grid-cols-2 sm:gap-x-5">
              <Key
                swatch="bg-foreground/75"
                label="Sellable now"
                value={`${executable}%`}
              />
              {/* La pastille reprend exactement la classe de sa zone : une
                  légende qui ne correspond pas à la marque ne sert à rien. */}
              <Key
                swatch="bg-foreground/[0.08]"
                label="Still vesting"
                value={`${vesting}%`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:border-l lg:pl-8">
          <Control
            label="Time since launch"
            options={TIME}
            value={time}
            onChange={setTime}
          />
          <Control
            label="Position drawdown"
            options={DRAWDOWN}
            value={drawdown}
            onChange={setDrawdown}
          />
          <p className="pt-1 text-xs text-muted-foreground">
            Hover or focus a value to recompute. Drawdown is a floor, never a
            bonus: a position in profit is never penalised for it.
          </p>
        </div>
      </div>
    </div>
  );
}

