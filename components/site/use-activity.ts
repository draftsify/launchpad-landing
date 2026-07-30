"use client";

import { useEffect, useMemo, useState } from "react";

import type { ProtocolActivity, TokenActivity } from "@/app/api/activity/route";
import { isDeployed } from "@/lib/chain";
import type { Activity } from "@/lib/indexer";

/** Le serveur met déjà en cache 30 s : interroger plus vite ne rendrait rien de neuf. */
const REFRESH_MS = 30_000;

type State<T> = { data: T | null; loading: boolean; error: string | null };

function useEndpoint<T>(url: string | null): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: isDeployed && url !== null,
    error: null,
  });

  useEffect(() => {
    if (!url || !isDeployed) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let alive = true;

    const load = async () => {
      try {
        const response = await fetch(url);
        const body = await response.json();
        if (!alive) return;
        if (!response.ok) {
          setState({ data: null, loading: false, error: body.error ?? "Read failed" });
          return;
        }
        setState({ data: body as T, loading: false, error: null });
      } catch (error) {
        if (!alive) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Read failed",
        });
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [url]);

  return state;
}

/**
 * L'historique d'un token : volume, trades, détenteurs, courbe de prix.
 *
 * Passe par l'API plutôt que par le nœud directement, parce que la réponse est
 * une somme de milliers de journaux — la calculer une fois pour tout le monde
 * vaut mieux que la recalculer dans chaque navigateur.
 */
export function useActivity(address: string | null) {
  return useEndpoint<Activity>(address ? `/api/activity/${address}` : null);
}

export function useProtocolActivity() {
  return useEndpoint<ProtocolActivity>("/api/activity");
}

/**
 * L'activité par token, indexée par adresse.
 *
 * Un seul appel pour toute la liste : demander carte par carte relirait les
 * journaux de chaque pool autant de fois qu'il y a de cartes affichées.
 */
export function useActivityByToken() {
  const { data, loading, error } = useProtocolActivity();

  // Mémorisée sur les données, pas reconstruite à chaque rendu : la liste des
  // lancements s'en sert comme dépendance de tri, et une Map neuve à chaque
  // passage referait le tri sans qu'aucune donnée ait bougé.
  const byToken = useMemo(() => {
    const map = new Map<string, TokenActivity>();
    for (const token of data?.tokens ?? []) map.set(token.address, token);
    return map;
  }, [data]);

  return { byToken, loading, error };
}
