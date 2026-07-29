/**
 * Trois schémas expliquant les mécaniques du protocole. Tout est dessiné en
 * SVG inline : monochrome, net à toute taille, et aucun asset à charger.
 */

const GRID_Y = [36, 72, 108];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 320 160"
      role="img"
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {GRID_Y.map((y) => (
        <line
          key={y}
          x1="8"
          x2="312"
          y1={y}
          y2={y}
          stroke="var(--color-border)"
          strokeDasharray="3 5"
        />
      ))}
      <line
        x1="8"
        x2="312"
        y1="144"
        y2="144"
        stroke="var(--color-border)"
      />
      {children}
    </svg>
  );
}

/** Courbe de déblocage : une part vendable dès le départ, puis montée continue. */
export function UnlockCurve() {
  const curve = "M12,132 C 90,128 140,104 190,70 S 268,26 308,20";
  return (
    <Frame>
      <title>Sellable share over time</title>
      <defs>
        <linearGradient id="unlock-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${curve} L308,144 L12,144 Z`} fill="url(#unlock-fill)" />
      <path
        d={curve}
        fill="none"
        stroke="var(--color-foreground)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="132" r="3" fill="var(--color-foreground)" />
      <circle cx="308" cy="20" r="3" fill="var(--color-foreground)" />
    </Frame>
  );
}

/** Protection en perte : la courbe s'accélère quand le prix décroche. */
export function LossProtection() {
  return (
    <Frame>
      <title>Unlock accelerates when the price drops</title>
      <path
        d="M12,132 C 110,128 200,108 308,32"
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <path
        d="M12,132 C 60,112 104,58 308,18"
        fill="none"
        stroke="var(--color-foreground)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* Repère du décrochage de prix qui déclenche l'accélération. */}
      <line
        x1="86"
        x2="86"
        y1="34"
        y2="126"
        stroke="var(--color-border)"
      />
      <path
        d="M82,54 L86,62 L90,54"
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="86" cy="44" r="2.5" fill="var(--color-foreground)" fillOpacity="0.7" />
    </Frame>
  );
}

/** Plafond d'impact : au-delà du seuil, la part excédentaire est refusée. */
export function ImpactCap() {
  const bars = [58, 92, 46, 128, 74, 112, 62, 96];
  const cap = 84;
  const width = 22;
  const gap = 16;

  return (
    <Frame>
      <title>Sell size capped per window</title>
      {bars.map((h, i) => {
        const x = 16 + i * (width + gap);
        const allowed = Math.min(h, cap);
        return (
          <g key={i}>
            {h > cap && (
              <rect
                x={x}
                y={144 - h}
                width={width}
                height={h - cap}
                rx="3"
                fill="var(--color-foreground)"
                fillOpacity="0.12"
              />
            )}
            <rect
              x={x}
              y={144 - allowed}
              width={width}
              height={allowed}
              rx="3"
              fill="var(--color-foreground)"
              fillOpacity="0.75"
            />
          </g>
        );
      })}
      <line
        x1="8"
        x2="312"
        y1={144 - cap}
        y2={144 - cap}
        stroke="var(--color-foreground)"
        strokeWidth="1.25"
        strokeDasharray="5 4"
      />
    </Frame>
  );
}
