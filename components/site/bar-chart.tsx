"use client";

import { useId, useState } from "react";
import { Table2 } from "lucide-react";

import type { DailyPoint } from "@/lib/analytics";
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
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const scale = niceMax(Math.max(...data.map((d) => d.value)), integer);
  const lastIndex = data.length - 1;
  const ticks = [scale, scale / 2, 0];

  return (
    <section className="flex flex-col rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/50 focus-visible:outline-none"
        >
          <Table2 className="size-3.5" />
          <span className="sr-only">
            {showTable ? "Hide data table" : "Show data table"}
          </span>
        </button>
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
                  <span
                    className={cn(
                      "w-full rounded-t-[4px] transition-opacity",
                      emphasis ? "bg-foreground" : "bg-foreground/40",
                      hovered !== null && hovered !== i && "opacity-70"
                    )}
                    style={{ height: `${height}%` }}
                  />
                  {emphasis && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -translate-y-1 text-center font-mono text-[10px] whitespace-nowrap text-foreground"
                      style={{ bottom: `${height}%` }}
                    >
                      {format(point.value)}
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

      {showTable && (
        <div id={tableId} className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title} by day</caption>
            <thead className="border-b bg-muted/40">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Day
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {title}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {point.date}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {format(point.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
