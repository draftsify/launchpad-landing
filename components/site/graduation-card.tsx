"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Lock } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { readGraduation, type Graduation, type Launch } from "@/lib/onchain";
import { GRADUATION_QUOTE_ETH } from "@/lib/presets";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Où en est le lancement par rapport au jalon de graduation.
 *
 * Deux choses gouvernent l'affichage, et elles se disent explicitement plutôt
 * que se déduire.
 *
 * La première : graduer ne migre rien. Beaucoup de launchpads déplacent la
 * liquidité vers un autre pool à ce moment-là, et l'utilisateur a de bonnes
 * raisons de le supposer ici aussi. Il faut donc l'écrire.
 *
 * La seconde : la progression est la quote que la position verrouillée
 * contient réellement au prix courant, pas le solde WETH du pool. Ce solde-là
 * compterait un virement direct, donc n'importe qui pourrait faire avancer la
 * barre en envoyant de l'ETH.
 */
export function GraduationCard({ launch }: { launch: Launch }) {
  const [data, setData] = useState<Graduation | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    readGraduation(launch.address)
      .then((g) => {
        if (alive) setData(g);
      })
      // Un nœud muet ne doit pas faire disparaître la carte : elle garde le
      // seuil du dépôt, qui reste vrai, et n'annonce simplement pas de chiffre.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [launch.address]);

  const threshold = data?.threshold ?? GRADUATION_QUOTE_ETH;
  const progress = data?.progress ?? null;
  const pct =
    progress === null ? 0 : Math.min(100, (progress / threshold) * 100);
  const done = data?.reached ?? false;

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <GraduationCap aria-hidden className="size-4 text-muted-foreground" />
            {done ? "Graduated" : "Progress to graduation"}
          </p>
          <p className="text-xs text-muted-foreground">
            {progress === null
              ? `Threshold is ${threshold} ETH.`
              : `${progress.toFixed(4)} of ${threshold} ETH held by the locked position.`}
          </p>
        </div>
        {progress !== null && (
          <p className="font-mono text-2xl font-medium tabular-nums">
            {pct.toFixed(0)}%
          </p>
        )}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-foreground/70"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }}
        />
      </div>

      <p className="mt-4 flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <strong className="font-medium text-foreground">
            Graduation is not migration.
          </strong>{" "}
          Nothing moves when it happens: same token, same pool, same fee tier,
          same locked position, same rules. It is a milestone, not a quality
          signal, and it guarantees no exit at any price.
        </span>
      </p>
    </div>
  );
}
