"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Bloc qui se révèle : flou → net, avec une légère montée. */
export function BlurIn({
  children,
  delay = 0,
  duration = 1,
  blur = 10,
  y = 14,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  blur?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, filter: `blur(${blur}px)`, y }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{ duration, delay, ease: EASE }}
      // Sans ça, Chrome recalcule le flou sur du texte non composité et
      // le rendu tremble pendant la transition.
      style={{ willChange: "filter, transform, opacity" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Révèle un texte mot par mot. Les espaces restent des nœuds de texte réels
 * entre les spans, sinon le retour à la ligne casse.
 */
export function BlurWords({
  text,
  delay = 0,
  stagger = 0.055,
  duration = 0.9,
  blur = 12,
  y = 16,
  className,
}: {
  text: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  blur?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  if (reduce) return <span className={className}>{text}</span>;

  return (
    <span className={cn("inline", className)}>
      {words.map((word, i) => (
        <React.Fragment key={`${word}-${i}`}>
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, filter: `blur(${blur}px)`, y }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{
              duration,
              delay: delay + i * stagger,
              ease: EASE,
            }}
            style={{ willChange: "filter, transform, opacity" }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </span>
  );
}
