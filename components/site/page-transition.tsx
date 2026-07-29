"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

/**
 * Transition d'entrée jouée à chaque changement de route. On n'anime que la
 * sortie de la page entrante : l'App Router démonte la page sortante avant
 * qu'une animation de sortie puisse se jouer, une AnimatePresence ne ferait
 * que retarder la navigation sans rien montrer.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
