"use client";

import { useCallback, useEffect, useState } from "react";

import { isDeployed } from "@/lib/chain";
import { readLaunchBySlug, readLaunches, type Launch } from "@/lib/onchain";

/** Le pool bouge à chaque bloc : on relit, sans jamais rien mettre en cache. */
const REFRESH_MS = 12_000;

type State<T> = {
  data: T;
  /** Vrai seulement au premier chargement : un rafraîchissement ne vide rien. */
  loading: boolean;
  error: string | null;
  reload: () => void;
};

function useChainRead<T>(read: () => Promise<T>, empty: T, deps: unknown[]): State<T> {
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(isDeployed);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isDeployed) {
      setLoading(false);
      return;
    }
    let alive = true;

    read()
      .then((result) => {
        if (!alive) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // Un nœud injoignable n'est pas « aucun lancement » : le dire.
        setError(err instanceof Error ? err.message : "The node did not answer");
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  useEffect(() => {
    const id = setInterval(reload, REFRESH_MS);
    return () => clearInterval(id);
  }, [reload]);

  return { data, loading, error, reload };
}

export function useLaunches() {
  return useChainRead<Launch[]>(readLaunches, [], []);
}

export function useLaunch(slug: string) {
  return useChainRead<Launch | null>(
    () => readLaunchBySlug(slug),
    null,
    [slug]
  );
}
