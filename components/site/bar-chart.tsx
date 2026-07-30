"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { DailyPoint } from "@/lib/analytics";
import { CountUp } from "@/components/site/count-up";
import { cn } from "@/lib/utils";

const PLOT_HEIGHT = 176;

/**
 * Arrondit le sommet de l'échelle à une valeur ronde au-dessus du maximum.
 * Deux effets : les graduations tombent juste, et la marge dégagée au-dessus
 * de la plus haute barre laisse la place à son étiquette.
 */
function niceMax(max: number, integer: boolean) {
  if (integer) return Math.max(4, Math.ceil(max / 4) * 4);
  const exponent = Math.floor(Math.log10(max));
  const base = 10 ** exponent;
  const n = max / base;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10;
  return step * base;
}

/**
 * Série unique en emphase : le dernier jour porte l'encre pleine, le contexte
 * recule. Pas de légende — le titre nomme déjà ce qui est tracé — et la valeur
 * mise en avant est directement étiquetée, donc l'écart de clarté n'est jamais
 * le seul canal de lecture.
 */
export function BarChart({
  title,
  subtitle,
  data,
  format,
  integer = false,
}: {
  title: string;
  subtitle: string;
  data: DailyPoint[];
  format: (value: number) => string;
  integer?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const reduce = useReducedMotion();

  // Une série vide ne se trace pas : sans elle, l'échelle vaudrait -Infinity et
  // l'axe des dates lirait une case qui n'existe pas.
  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-1 rounded-2xl border bg-card p-5">
        <h3 className="font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        <p className="mt-8 mb-8 text-center text-sm text-muted-foreground">
          Nothing to chart yet.
        </p>
      </section>
    );
  }

  const scale = niceMax(Math.max(...data.map((d) => d.value)), integer);
  const lastIndex = data.length - 1;
  const ticks = [scale, scale / 2, 0];

  return (
    <section className="flex flex-col rounded-2xl border bg-card p-5">
      <div className="space-y-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mt-6 flex gap-3">
        <div
          aria-hidden
          className="flex w-12 shrink-0 flex-col justify-between text-right font-mono text-[10px] text-muted-foreground tabular-nums"
          style={{ height: PLOT_HEIGHT }}
        >
          {ticks.map((t, i) => (
            <span key={i} className="-translate-y-1/2 first:translate-y-0 last:-translate-y-full">
              {format(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Grille en filets pleins, une nuance au-dessus du fond. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ height: PLOT_HEIGHT }}
          >
            {[0, 0.5, 1].map((p) => (
              <div
                key={p}
                className="absolute inset-x-0 h-px bg-border"
                style={{ top: `${p * 100}%` }}
              />
            ))}
          </div>

          <div
            className="relative flex items-end justify-between gap-2"
            style={{ height: PLOT_HEIGHT }}
            onMouseLeave={() => setHovered(null)}
          >
            {data.map((point, i) => {
              const emphasis = i === lastIndex;
              const height = Math.max((point.value / scale) * 100, 1.5);

              return (
                <button
                  key={point.date}
                  type="button"
                  // Cible étendue à toute la hauteur : viser une barre courte
                  // au pixel près est impraticable.
                  className="group relative flex h-full max-w-6 flex-1 cursor-default items-end focus-visible:outline-none"
                  onMouseEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${point.date}: ${format(point.value)}`}
                >
                  {/* Les barres poussent depuis la ligne de base, en cascade. */}
                  <motion.span
                    className={cn(
                      "w-full origin-bottom rounded-t-[4px] transition-opacity",
                      emphasis ? "bg-foreground" : "bg-foreground/40",
                      hovered !== null && hovered !== i && "opacity-70"
                    )}
                    style={{ height: `${height}%` }}
                    initial={reduce ? undefined : { scaleY: 0 }}
                    whileInView={reduce ? undefined : { scaleY: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{
                      duration: 0.8,
                      delay: i * 0.04,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                  {emphasis && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -translate-y-1 text-center font-mono text-[10px] whitespace-nowrap text-foreground"
                      style={{ bottom: `${height}%` }}
                    >
                      <CountUp
                        value={point.value}
                        format={format}
                        delay={0.3}
                        duration={1.2}
                      />
                    </span>
                  )}
                </button>
              );
            })}

            {hovered !== null && hovered !== lastIndex && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-2 rounded-lg border bg-background px-2.5 py-1.5 whitespace-nowrap shadow-xl"
                style={{
                  left: `${((hovered + 0.5) / data.length) * 100}%`,
                  bottom: `${(data[hovered].value / scale) * 100}%`,
                }}
              >
                <span className="block text-sm font-medium">
                  {format(data[hovered].value)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {data[hovered].date}
                </span>
              </div>
            )}
          </div>

          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{data[0].date}</span>
            <span>{data[Math.floor(lastIndex / 2)].date}</span>
            <span className="text-foreground">{data[lastIndex].date}</span>
          </div>
        </div>
      </div>

    </section>
  );
}
