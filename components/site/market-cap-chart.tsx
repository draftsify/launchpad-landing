"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { CountUp } from "@/components/site/count-up";
import { formatUsd } from "@/lib/format";
import { buildSeries, type ChartSource, type SeriesPoint } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const HEIGHT = 268;
// Gouttière droite pour l'échelle, comme sur la référence : les valeurs se
// lisent près du dernier point, là où l'œil finit sa course.
const PAD = { top: 16, right: 58, bottom: 26 };
// Au-delà, le tracé gagne des points que l'écran ne peut pas distinguer.
const MAX_DRAWN = 220;
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Fenêtres proposées. Pas de « 7 j » : le token n'a que 3 j 14 h d'historique,
 * l'onglet serait un mensonge poli.
 */
const RANGES = [
  { id: "1H", hours: 1, label: "Past hour", sr: "over the past hour" },
  { id: "6H", hours: 6, label: "Past 6 hours", sr: "over the past 6 hours" },
  { id: "24H", hours: 24, label: "Past 24 hours", sr: "over the past 24 hours" },
  { id: "ALL", hours: null, label: "Since launch", sr: "since launch" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

// Fuseau et locale figés : le serveur et le navigateur doivent produire la
// même chaîne, sinon l'hydratation diverge.
const opts = { timeZone: "UTC" } as const;
const AT = new Intl.DateTimeFormat("en-US", {
  ...opts,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const ON = new Intl.DateTimeFormat("en-US", { ...opts, month: "short", day: "numeric" });
const CLOCK = new Intl.DateTimeFormat("en-US", {
  ...opts,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

/** Garde le premier et le dernier point : ce sont eux qui portent la variation. */
function thin(points: SeriesPoint[], max: number) {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % stride === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Capitalisation dans le temps : une série, donc pas de légende — le titre
 * nomme ce qui est tracé. La ligne pointillée marque l'ouverture de la fenêtre
 * choisie, seul repère fixe contre lequel la courbe se lit.
 */
export function MarketCapChart({ source }: { source: ChartSource }) {
  const gradientId = useId();
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [rangeId, setRangeId] = useState<RangeId>("ALL");

  const range = RANGES.find((r) => r.id === rangeId)!;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Changer de fenêtre renumérote les points : le curseur pointerait ailleurs.
  useEffect(() => setActive(null), [rangeId]);

  const full = useMemo(() => buildSeries(source), [source]);

  const points = useMemo(() => {
    if (range.hours === null) return thin(full, MAX_DRAWN);
    const span = (range.hours * 60) / source.stepMinutes;
    return thin(full.slice(Math.max(0, full.length - 1 - span)), MAX_DRAWN);
  }, [full, range, source.stepMinutes]);

  const open = points[0].value;
  const last = points[points.length - 1].value;
  const change = ((last - open) / open) * 100;
  const up = change >= 0;
  // Sous 36 h, la date se répète d'un bout à l'autre : c'est l'heure qui parle.
  const byClock = range.hours !== null && range.hours <= 36;

  const g = useMemo(() => {
    const plotW = Math.max(width - PAD.right, 0);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const base = PAD.top + plotH;

    const values = points.map((p) => p.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    // Marge verticale : la courbe ne touche ni le haut de la carte ni l'axe.
    const room = (high - low) * 0.12 || high * 0.02 || 1;
    const lo = low - room;
    const hi = high + room;

    const x = (i: number) => (i / (points.length - 1)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    const line = points
      .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`)
      .join(" ");

    return {
      plotW,
      base,
      x,
      y,
      line,
      area: `${line} L${plotW.toFixed(2)},${base} L0,${base} Z`,
      // Graduations posées sur les extrêmes réels : les nombres tombent juste.
      yTicks: [high, (high + low) / 2, low],
      xTicks: [
        0,
        Math.round((points.length - 1) / 3),
        Math.round(((points.length - 1) * 2) / 3),
        points.length - 1,
      ],
    };
  }, [width, points]);

  function pick(clientX: number, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const i = Math.round(((clientX - rect.left) / g.plotW) * (points.length - 1));
    setActive(clamp(i, 0, points.length - 1));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step) {
      e.preventDefault();
      setActive((a) => clamp((a ?? points.length - 1) + step, 0, points.length - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(points.length - 1);
    }
  }

  const hovered = active === null ? null : points[active];

  return (
    <figure className="flex flex-col rounded-2xl border bg-card p-5">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Market cap
          </p>
          <div className="flex items-baseline gap-2">
            {/* La valeur courante ne dépend pas de la fenêtre : seule la
                variation change, donc le chiffre ne se rejoue pas. */}
            <CountUp
              value={last}
              format={formatUsd}
              delay={0.15}
              className="text-3xl font-medium tracking-tight"
            />
            {/* En monochrome, la direction passe par la flèche. */}
            <span className="font-mono text-xs tabular-nums">
              <span aria-hidden>{up ? "↑" : "↓"}</span>
              {Math.abs(change).toFixed(1)}%
              <span className="sr-only">
                {up ? "up" : "down"} {range.sr}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{range.label}</span>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Time range"
          className="inline-flex shrink-0 items-center rounded-full border bg-card p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={rangeId === r.id}
              onClick={() => setRangeId(r.id)}
              className={cn(
                "h-7 rounded-full px-3 font-mono text-xs transition-colors",
                rangeId === r.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.id}
            </button>
          ))}
        </div>
      </figcaption>

      <div ref={wrapRef} className="relative mt-5" style={{ height: HEIGHT }}>
        {width > 0 && (
          <>
            <svg
              aria-hidden
              width={width}
              height={HEIGHT}
              className="absolute inset-0 overflow-visible"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fafafa" stopOpacity="0.17" />
                  <stop offset="100%" stopColor="#fafafa" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grille en pointillé, une nuance au-dessus du fond. */}
              {g.yTicks.map((t) => (
                <line
                  key={t}
                  x1="0"
                  x2={g.plotW}
                  y1={g.y(t)}
                  y2={g.y(t)}
                  stroke="var(--color-border)"
                  strokeDasharray="3 5"
                />
              ))}

              {/* Remonté à chaque fenêtre : le tracé se redessine. */}
              <motion.path
                key={`area-${rangeId}`}
                d={g.area}
                fill={`url(#${gradientId})`}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.8, delay: 0.3 }}
              />

              {/* La courbe se trace de gauche à droite, dans le sens du temps. */}
              <motion.path
                key={`line-${rangeId}`}
                d={g.line}
                fill="none"
                stroke="#fafafa"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 1.1, ease: EASE }}
              />

              {/* Ouverture de la fenêtre. */}
              <line
                x1="0"
                x2={g.plotW}
                y1={g.y(open)}
                y2={g.y(open)}
                stroke="#fafafa"
                strokeOpacity="0.45"
                strokeDasharray="5 5"
              />
              <circle
                cx={g.plotW}
                cy={g.y(open)}
                r="5"
                fill="var(--color-card)"
                stroke="#fafafa"
                strokeWidth="2"
              />

              {hovered && (
                <>
                  <line
                    x1={g.x(active!)}
                    x2={g.x(active!)}
                    y1={PAD.top}
                    y2={g.base}
                    stroke="#fafafa"
                    strokeOpacity="0.3"
                    strokeDasharray="3 4"
                  />
                  {/* Anneau de la couleur de la carte : la marque reste lisible
                      même posée sur la courbe. */}
                  <circle
                    cx={g.x(active!)}
                    cy={g.y(hovered.value)}
                    r="4.5"
                    fill="#fafafa"
                    stroke="var(--color-card)"
                    strokeWidth="2"
                  />
                </>
              )}

              <motion.g
                key={`tip-${rangeId}`}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 1 }}
              >
                <circle
                  cx={g.x(points.length - 1)}
                  cy={g.y(last)}
                  r="9"
                  fill="#fafafa"
                  fillOpacity="0.14"
                />
                <circle cx={g.x(points.length - 1)} cy={g.y(last)} r="3.5" fill="#fafafa" />
              </motion.g>
            </svg>

            {g.yTicks.map((t) => (
              <span
                key={t}
                className="pointer-events-none absolute right-0 -translate-y-1/2 font-mono text-[10px] text-muted-foreground tabular-nums"
                style={{ top: g.y(t) }}
              >
                {formatUsd(t)}
              </span>
            ))}

            {g.xTicks.map((i, n) => (
              <span
                key={i}
                className={cn(
                  "pointer-events-none absolute bottom-0 font-mono text-[10px] text-muted-foreground",
                  n > 0 && n < 3 && "-translate-x-1/2",
                  n === 3 && "-translate-x-full text-foreground"
                )}
                style={{ left: g.x(i) }}
              >
                {(byClock ? CLOCK : ON).format(new Date(points[i].t))}
              </span>
            ))}

            {/* L'étiquette de l'ouverture cède la place à l'infobulle. */}
            {!hovered && (
              <span
                className="pointer-events-none absolute -translate-x-full -translate-y-1/2 rounded-md border bg-background/90 px-2 py-1 font-mono text-[10px] whitespace-nowrap text-muted-foreground backdrop-blur-sm"
                style={{ top: g.y(open), left: g.plotW - 14 }}
              >
                {rangeId === "ALL" ? "Launch" : "Open"} {formatUsd(open)}
              </span>
            )}

            {hovered && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-background px-2.5 py-1.5 whitespace-nowrap shadow-xl"
                style={{
                  left: clamp(g.x(active!), 52, g.plotW - 52),
                  top: g.y(hovered.value) - 14,
                }}
              >
                <span className="block text-sm font-medium">
                  {formatUsd(hovered.value)}
                </span>
                <span className="block font-mono text-[10px] text-muted-foreground">
                  {AT.format(new Date(hovered.t))}
                </span>
              </div>
            )}

            {/* Cible d'interaction : toute la hauteur du tracé, viser la courbe
                au pixel près serait impraticable. */}
            <div
              tabIndex={0}
              role="slider"
              aria-label={`Read market cap ${range.sr}`}
              aria-valuemin={0}
              aria-valuemax={points.length - 1}
              aria-valuenow={active ?? points.length - 1}
              aria-valuetext={
                hovered
                  ? `${AT.format(new Date(hovered.t))}: ${formatUsd(hovered.value)}`
                  : `Latest: ${formatUsd(last)}`
              }
              onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
              onPointerLeave={() => setActive(null)}
              onKeyDown={onKeyDown}
              onBlur={() => setActive(null)}
              className="absolute top-0 left-0 rounded-lg focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none"
              style={{ width: g.plotW, height: g.base }}
            />
          </>
        )}
      </div>

      {/* Chaque valeur tracée reste atteignable hors survol. */}
      <table className="sr-only">
        <caption>Market cap, {range.label.toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col">Time (UTC)</th>
            <th scope="col">Market cap</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.t}>
              <th scope="row">{AT.format(new Date(p.t))}</th>
              <td>{formatUsd(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
