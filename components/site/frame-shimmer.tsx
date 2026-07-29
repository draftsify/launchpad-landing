"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Reflet qui descend lentement le long des filets verticaux du cadre.
 * Décalé entre la gauche et la droite pour éviter l'effet « deux ascenseurs
 * synchronisés », et suivi d'une pause pour rester discret.
 */
function Line({ side, delay }: { side: "left" | "right"; delay: number }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute top-0 z-1 hidden h-full w-px overflow-hidden md:block ${
        side === "left" ? "-left-px" : "-right-px"
      }`}
    >
      <motion.div
        className="absolute inset-x-0 h-48 bg-linear-to-b from-transparent via-foreground/45 to-transparent"
        initial={{ top: "-20%" }}
        animate={{ top: ["-20%", "100%"] }}
        transition={{
          duration: 11,
          delay,
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 4,
        }}
        style={{ willChange: "top" }}
      />
    </div>
  );
}

export function FrameShimmer() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <>
      <Line side="left" delay={1.2} />
      <Line side="right" delay={6.5} />
    </>
  );
}
