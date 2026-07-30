"use client";

import { useEffect, useState } from "react";

import { readRules } from "@/lib/onchain";
import { RULES, type Rules } from "@/lib/presets";

/**
 * Les règles du launcher déployé.
 *
 * Immuables une fois le contrat en place, donc lues une fois au montage et
 * jamais rafraîchies.
 *
 * En attendant la réponse — et sur les pages présentées sans launcher —, ce
 * sont les valeurs du dépôt qui s'affichent : celles avec lesquelles le script
 * de déploiement écrit le launcher, donc la bonne réponse dans le cas normal.
 * La chaîne a le dernier mot dès qu'elle a parlé, y compris si elle contredit
 * le dépôt : c'est elle qui applique.
 */
export function useRules(): Rules {
  const [rules, setRules] = useState<Rules>(RULES);

  useEffect(() => {
    let alive = true;
    readRules()
      .then((onchain) => {
        if (alive && onchain) setRules(onchain);
      })
      // Un nœud muet laisse les valeurs du dépôt en place : elles restent le
      // meilleur pari disponible, et l'échec est déjà signalé ailleurs.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return rules;
}
