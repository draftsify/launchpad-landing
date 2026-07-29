"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Défilement du chiffre à l'apparition.
 *
 * Le texte est écrit directement dans le nœud plutôt que via un état React :
 * un setState par frame ferait re-rendre le composant soixante fois par
 * seconde pour un simple changement de texte.
 *
 * L'opacité initiale est portée par motion, donc rendue côté serveur : sans
 * ça la valeur finale s'afficherait une fraction de seconde avant de retomber
 * à zéro pour démarrer le comptage.
 */
export function CountUp({
  value,
  format,
  duration = 1.6,
  delay = 0,
  className,
}: {
  value: number;
  format: (value: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;

    if (reduce) {
      node.textContent = format(value);
      return;
    }

    const controls = animate(0, value, {
      duration,
      delay,
      ease: EASE,
      onUpdate: (v) => {
        node.textContent = format(v);
      },
    });
    return () => controls.stop();
    // format est recréé à chaque rendu par l'appelant : l'exclure évite de
    // relancer l'animation sans raison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, duration, delay, reduce]);

  return (
    <motion.span
      ref={ref}
      initial={reduce ? undefined : { opacity: 0, filter: "blur(8px)", y: 8 }}
      animate={inView ? { opacity: 1, filter: "blur(0px)", y: 0 } : undefined}
      transition={{ duration: 0.7, delay, ease: EASE }}
      style={{ willChange: "filter, transform, opacity" }}
      className={className}
    >
      {format(value)}
    </motion.span>
  );
}
