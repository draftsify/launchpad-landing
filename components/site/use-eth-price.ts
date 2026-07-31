"use client";

import { useEffect, useState } from "react";

/**
 * Le prix de l'ETH en dollars, ou `null`.
 *
 * `null` n'est pas une valeur d'attente à masquer : c'est le cas où l'on ne
 * sait pas, et où l'interface doit retomber sur l'ETH plutôt que d'inventer un
 * dollar. Les appelants doivent donc traiter les deux cas, ce que le type
 * impose.
 *
 * Rafraîchi toutes les cinq minutes, comme le cache de la route : plus souvent
 * ne rendrait pas la valeur plus fraîche.
 */
export function useEthPrice() {
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const read = () =>
      fetch("/api/eth-price")
        .then((r) => r.json())
        .then((body: { usd: number | null }) => {
          if (alive) setUsd(typeof body.usd === "number" ? body.usd : null);
        })
        .catch(() => {});

    read();
    const id = setInterval(read, 300_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return usd;
}
