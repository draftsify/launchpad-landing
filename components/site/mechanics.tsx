"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Schémas des mécaniques du protocole. Tout est en SVG inline : monochrome,
 * net à toute taille, aucun asset à charger. Les tracés se dessinent au
 * défilement plutôt que d'apparaître d'un bloc.
 */

const EASE = [0.16, 1, 0.3, 1] as const;
const VIEWPORT = { once: true, amount: 0.5 } as const;

const GRID_Y = [40, 76, 112];

function Frame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 320 168"
      role="img"
      aria-label={label}
      className="h-auto w-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
    >
      {GRID_Y.map((y) => (
        <line
          key={y}
          x1="10"
          x2="310"
          y1={y}
          y2={y}
          stroke="var(--color-border)"
          strokeDasharray="2 6"
        />
      ))}
      <line x1="10" x2="310" y1="148" y2="148" stroke="var(--color-border)" />
      {children}
    </svg>
  );
}

/** Petite étiquette posée dans le repère. */
function Tag({
  x,
  y,
  children,
  anchor = "start",
  dim,
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "end" | "middle";
  dim?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className="font-mono"
      fontSize="9"
      fill="var(--color-foreground)"
      fillOpacity={dim ? 0.4 : 0.7}
    >
      {children}
    </text>
  );
}

function useDraw() {
  const reduce = useReducedMotion();
  return (delay = 0, duration = 1.4) =>
    reduce
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          whileInView: { pathLength: 1, opacity: 1 },
          viewport: VIEWPORT,
          transition: {
            pathLength: { duration, delay, ease: EASE },
            opacity: { duration: 0.3, delay },
          },
        };
}

/** Courbe de déblocage : une part vendable dès le départ, puis montée continue. */
export function UnlockCurve() {
  const draw = useDraw();
  const reduce = useReducedMotion();
  const curve = "M14,128 C 92,124 140,102 188,72 S 266,30 306,24";

  return (
    <Frame label="Sellable share of a position over time">
      <defs>
        <linearGradient id="unlock-fill" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--color-foreground)"
            stopOpacity="0.2"
          />
          <stop
            offset="100%"
            stopColor="var(--color-foreground)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>

      <motion.path
        d={`${curve} L306,148 L14,148 Z`}
        fill="url(#unlock-fill)"
        initial={reduce ? undefined : { opacity: 0 }}
        whileInView={reduce ? undefined : { opacity: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
      <motion.path
        d={curve}
        fill="none"
        stroke="var(--color-foreground)"
        strokeWidth="1.75"
        strokeLinecap="round"
        {...draw()}
      />

      <circle cx="14" cy="128" r="3" fill="var(--color-foreground)" />
      <circle cx="306" cy="24" r="3" fill="var(--color-foreground)" />
      <Tag x={22} y={122} dim>
        10%
      </Tag>
      <Tag x={298} y={18} anchor="end">
        100%
      </Tag>
      <Tag x={14} y={162} dim>
        launch
      </Tag>
      <Tag x={306} y={162} anchor="end" dim>
        24h
      </Tag>
    </Frame>
  );
}

/** Protection en perte : la courbe s'accélère quand le prix décroche. */
export function LossProtection() {
  const draw = useDraw();

  return (
    <Frame label="Unlock curve, normal versus drawdown">
      <motion.path
        d="M14,128 C 112,124 200,106 306,36"
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity="0.28"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
        {...draw(0)}
      />
      <motion.path
        d="M14,128 C 58,110 100,56 306,22"
        fill="none"
        stroke="var(--color-foreground)"
        strokeWidth="1.75"
        strokeLinecap="round"
        {...draw(0.35)}
      />

      {/* Repère du décrochage de prix qui déclenche l'accélération. */}
      <line x1="80" x2="80" y1="40" y2="130" stroke="var(--color-border)" />
      <path
        d="M76,58 L80,66 L84,58"
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Tag x={88} y={52} dim>
        −20% price
      </Tag>
      <Tag x={306} y={16} anchor="end">
        faster
      </Tag>
      <Tag x={306} y={48} anchor="end" dim>
        normal
      </Tag>
    </Frame>
  );
}

/** Plafond d'impact : au-delà du seuil, la part excédentaire est refusée. */
export function ImpactCap() {
  const reduce = useReducedMotion();
  const bars = [54, 96, 42, 132, 70, 116, 60, 100];
  const cap = 84;
  const width = 20;
  const gap = 18;

  return (
    <Frame label="Sell size against the per-window cap">
      {bars.map((h, i) => {
        const x = 18 + i * (width + gap);
        const allowed = Math.min(h, cap);
        const excess = Math.max(0, h - cap);
        const anim = reduce
          ? {}
          : {
              initial: { scaleY: 0 },
              whileInView: { scaleY: 1 },
              viewport: VIEWPORT,
              transition: { duration: 0.7, delay: 0.06 * i, ease: EASE },
            };

        return (
          <g key={i} style={{ transformOrigin: `${x}px 148px` }}>
            {excess > 0 && (
              <motion.rect
                x={x}
                y={148 - h}
                width={width}
                height={excess}
                rx="3"
                fill="var(--color-foreground)"
                fillOpacity="0.1"
                stroke="var(--color-foreground)"
                strokeOpacity="0.18"
                strokeDasharray="3 3"
                style={{ transformOrigin: `${x + width / 2}px ${148 - cap}px` }}
                {...anim}
              />
            )}
            <motion.rect
              x={x}
              y={148 - allowed}
              width={width}
              height={allowed}
              rx="3"
              fill="var(--color-foreground)"
              fillOpacity="0.72"
              style={{ transformOrigin: `${x + width / 2}px 148px` }}
              {...anim}
            />
          </g>
        );
      })}

      <motion.line
        x1="10"
        x2="310"
        y1={148 - cap}
        y2={148 - cap}
        stroke="var(--color-foreground)"
        strokeWidth="1.25"
        strokeDasharray="5 4"
        initial={reduce ? undefined : { pathLength: 0, opacity: 0 }}
        whileInView={reduce ? undefined : { pathLength: 1, opacity: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.9, delay: 0.3, ease: EASE }}
      />
      <Tag x={310} y={148 - cap - 6} anchor="end">
        cap
      </Tag>
    </Frame>
  );
}
