"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { formatEth } from "@/lib/format";
import type { PricePoint } from "@/lib/indexer";

const HEIGHT = 200;
const WIDTH = 600;

function label(time: number) {
  return new Date(time * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Le prix dans le temps, tel que les swaps l'ont laissé.
 *
 * Un tracé, pas des barres : le prix est continu entre deux échanges, alors
 * qu'une barre affirme une quantité par période. L'aire sous la courbe ne dit
 * rien de plus que la courbe — elle donne seulement au trait de quoi se
 * détacher du fond.
 *
 * L'échelle verticale ne part pas de zéro et l'annonce. Sur un token dont le
 * prix vaut 1,6e-9 ETH, un axe partant de zéro écraserait toute variation en
 * une ligne plate ; forcer l'origine serait ici la lecture la plus trompeuse.
 */
export function PriceChart({ points }: { points: PricePoint[] }) {
  const gradient = useId();
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        {points.length === 0
          ? "No swap yet — nothing to plot."
          : "One swap so far. A price needs two points to have a shape."}
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // Une série parfaitement plate n'a pas d'amplitude : on lui en donne une,
  // sinon la division ci-dessous rendrait NaN et la courbe disparaîtrait.
  const span = max - min || max || 1;

  const x = (i: number) => (i / (points.length - 1)) * WIDTH;
  const y = (price: number) => HEIGHT - ((price - min) / span) * (HEIGHT * 0.82) - HEIGHT * 0.09;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.price)}`).join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  const active = hovered === null ? points.length - 1 : hovered;
  const first = points[0].price;
  const last = points[points.length - 1].price;
  const change = first > 0 ? ((last - first) / first) * 100 : null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-mono text-lg">{formatEth(points[active].price)}</p>
          <p className="text-xs text-muted-foreground">{label(points[active].time)}</p>
        </div>
        {change !== null && (
          <p className="font-mono text-sm text-muted-foreground">
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}% over the window
          </p>
        )}
      </div>

      <div
        className="relative"
        onMouseLeave={() => setHovered(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          setHovered(
            Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))))
          );
        }}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-[200px] w-full"
          role="img"
          aria-label={`Price from ${label(points[0].time)} to ${label(points[points.length - 1].time)}`}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={area} fill={`url(#${gradient})`} className="text-foreground" />
          <motion.path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="text-foreground"
            initial={reduce ? undefined : { pathLength: 0 }}
            animate={reduce ? undefined : { pathLength: 1 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />

          {hovered !== null && (
            <>
              <line
                x1={x(hovered)}
                y1={0}
                x2={x(hovered)}
                y2={HEIGHT}
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className="text-border"
              />
              <circle
                cx={x(hovered)}
                cy={y(points[hovered].price)}
                r={3}
                className="fill-foreground"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      </div>

      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{label(points[0].time)}</span>
        <span>{label(points[points.length - 1].time)}</span>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Vertical scale spans the observed range, not from zero.
      </p>
    </div>
  );
}
