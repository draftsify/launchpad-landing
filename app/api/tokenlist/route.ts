import { NextResponse } from "next/server";

import { activeChain, isDeployed, siteUrl } from "@/lib/chain";
import { readLaunches } from "@/lib/onchain";

/**
 * La liste des tokens, au format Token List.
 *
 * C'est le seul mécanisme que portefeuilles et agrégateurs consomment
 * réellement pour découvrir des logos : une URL, un JSON versionné, une entrée
 * par token avec son `logoURI`. Rien de propre à Reveal là-dedans, et c'est
 * exactement l'intérêt — `metadataURI()` est une fonction que personne d'autre
 * n'appellera jamais.
 *
 * Ce que ça ne fait pas : apparaître tout seul quelque part. Une liste doit
 * être soumise ou pointée par qui l'affiche. Elle rend la chose possible, elle
 * ne la rend pas automatique.
 *
 * `version` bouge avec le nombre de tokens plutôt qu'avec une date : une liste
 * dont la version change sans que rien n'ait changé force des rechargements
 * pour rien.
 */
export const revalidate = 300;

export async function GET() {
  if (!isDeployed) {
    return NextResponse.json({ error: "No launcher deployed" }, { status: 503 });
  }

  try {
    const launches = await readLaunches();
    const base = siteUrl();

    return NextResponse.json(
      {
        name: "Reveal",
        timestamp: new Date().toISOString(),
        version: { major: 1, minor: launches.length, patch: 0 },
        logoURI: `${base}/logo.png`,
        keywords: ["reveal", "launchpad", "robinhood chain"],
        tokens: launches.map((launch) => ({
          chainId: activeChain.id,
          address: launch.address,
          name: launch.name,
          symbol: launch.symbol,
          decimals: 18,
          // Absent plutôt que cassé : une entrée pointant sur une image qui
          // n'existe pas est pire qu'une entrée sans image.
          ...(launch.meta?.thumbnail || launch.meta?.image
            ? { logoURI: `${base}/api/token/${launch.address}/image` }
            : {}),
        })),
      },
      {
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Read failed" },
      { status: 502 }
    );
  }
}
