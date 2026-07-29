"use client";

import { motion, useReducedMotion } from "motion/react";

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
  const reduce = useReducedMotion();

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
          const fromCenter = Math.abs(i - (BAR_COUNT - 1) / 2);

          return (
            <motion.div
              key={i}
              initial={reduce ? false : { scaleY: 0 }}
              animate={{ scaleY: scale }}
              transition={{
                duration: 1.8,
                delay: 0.15 + fromCenter * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="h-full origin-bottom rounded-t-md border-x-[0.5px] first:border-l-0 last:border-r-0"
              style={{
                flex: `1 0 calc(100% / ${BAR_COUNT})`,
                maxWidth: `calc(100% / ${BAR_COUNT})`,
              }}
            >
              {/*
                Respiration continue, sur un élément imbriqué : la barre garde
                sa hauteur d'entrée (bordures stables) pendant que la lumière
                monte et redescend. Le débordement en haut est invisible,
                le dégradé y est déjà transparent.
              */}
              <motion.div
                className="h-full w-full origin-bottom bg-linear-to-t from-primary/85 to-transparent"
                animate={
                  reduce
                    ? undefined
                    : {
                        scaleY: [1, 1.06, 0.95, 1],
                        opacity: [1, 0.86, 1, 1],
                      }
                }
                transition={{
                  duration: 17,
                  // Décalage de phase croissant : la respiration traverse
                  // le graphe de gauche à droite au lieu de pulser d'un bloc.
                  delay: 2 + i * 0.42,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "loop",
                }}
                style={{ willChange: "transform, opacity" }}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
