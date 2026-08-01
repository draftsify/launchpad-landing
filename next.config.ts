import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Des adresses courtes pour ce qu'on donne à des tiers.
   *
   * `/ipfs/<cid>` et `/token/<adresse>.json` sont les URL qu'on colle dans un
   * formulaire d'agrégateur ou qu'on envoie à quelqu'un. `/api/...` y est du
   * bruit : ça dit comment c'est servi, pas ce que c'est, et un préfixe `api`
   * dans un champ « logo » a l'air d'une adresse interne plutôt que d'une
   * ressource stable. Les routes d'origine restent valides — rien de ce qui a
   * déjà été communiqué ne casse.
   */
  async rewrites() {
    return [
      { source: "/ipfs/:cid", destination: "/api/ipfs/:cid" },
      { source: "/token/:address.json", destination: "/api/token/:address" },
      { source: "/tokenlist.json", destination: "/api/tokenlist" },
    ];
  },
};

export default nextConfig;
