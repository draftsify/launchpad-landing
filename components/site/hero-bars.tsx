"use client";

import { motion } from "motion/react";

const BAR_COUNT = 15;
const MIN_SCALE = 0.3;

/**
 * Profil symétrique en vallée : hautes sur les bords, basses au centre.
 * L'exposant creuse la courbe pour éviter un simple V linéaire.
 */
function scaleFor(index: number) {
  const center = (BAR_COUNT - 1) / 2;
  const distance = Math.abs(index - center) / center;
  return MIN_SCALE + (1 - MIN_SCALE) * distance ** 1.2;
}

export function HeroBars() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 inset-y-1/3 bottom-0 z-0 overflow-hidden"
    >
      <div
        className="flex size-full"
        style={{
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          const scale = scaleFor(i);
          return (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: scale }}
              transition={{
                duration: 1.6,
                delay: 0.15 + Math.abs(i - (BAR_COUNT - 1) / 2) * 0.04,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="h-full origin-bottom rounded-t-md border-x-[0.5px] bg-linear-to-t from-primary/85 to-transparent first:border-l-0 last:border-r-0"
              style={{
                flex: `1 0 calc(100% / ${BAR_COUNT})`,
                maxWidth: `calc(100% / ${BAR_COUNT})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
