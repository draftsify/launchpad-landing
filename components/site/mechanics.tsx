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

/**
 * Les valeurs de `RevealRules`, calculées et non estimées.
 *
 * L'axe du temps annonçait 0h / 6h / 12h / 24h — un calendrier qui n'a jamais
 * été celui du protocole, et qui survivait au passage à une heure comme au
 * passage à un quart d'heure. Ce sont maintenant les quatre points de
 * `timeUnlockedBps` avec `initialUnlockBps = 1000` et `unlockSeconds = 900` :
 * 10 % au départ, puis une droite jusqu'à 100 %.
 */
const TIME = [
  // Libellés courts, comme ceux de la rangée du dessous : quatre pastilles
  // doivent tenir côte à côte dans une colonne étroite, et « 0 min » y passait
  // à la ligne. L'unité est portée par l'intitulé du contrôle.
  { id: "0", label: "0m", unlocked: 10 },
  { id: "5", label: "5m", unlocked: 40 },
  { id: "10", label: "10m", unlocked: 70 },
  { id: "15", label: "15m", unlocked: 100 },
];

/**
 * `reliefBps` : ticks de baisse / 6932, plafonné à 100 %. Un tick vaut 1,0001×,
 * donc une baisse de p pour cent vaut ln(1 − p) / ln(1,0001) ticks.
 *
 * Les planchers affichés ici étaient 30 / 50 / 95 %. Les vrais sont 15 / 32 /
 * 74 % — le simulateur promettait donc à peu près le double du relief que le
 * contrat accorde, sur la page qui sert justement à comprendre la règle.
 */
const DRAWDOWN = [
  { id: "0", label: "0%", floor: 0 },
  { id: "10", label: "−10%", floor: 15 },
  { id: "20", label: "−20%", floor: 32 },
  { id: "40", label: "−40%", floor: 74 },
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
                // whitespace-nowrap : la pastille a une hauteur fixe, donc un
                // libellé qui passe à la ligne en déborde au lieu de l'agrandir.
                "h-7 rounded-full border px-2.5 font-mono text-xs whitespace-nowrap transition-colors",
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
            /* Depuis l'achat, pas depuis le lancement : chaque position a son
               propre calendrier, et quelqu'un qui entre tard repart de 10 %. */
            label="Time since the buy (min)"
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

