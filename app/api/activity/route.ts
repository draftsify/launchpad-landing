import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { isDeployed, publicClient } from "@/lib/chain";
import { readActivity } from "@/lib/indexer";
import { readLaunches } from "@/lib/onchain";
import { poolAbi } from "@/lib/uniswap";

const REVALIDATE = 60;

/** Ce qu'une carte de token a besoin de savoir, sans sa courbe. */
export type TokenActivity = {
  address: string;
  volume24h: number;
  volumeTotal: number;
  trades: number;
  holders: number;
  change24h: number | null;
};

export type ProtocolActivity = {
  volumeTotal: number;
  volume24h: number;
  trades: number;
  trades24h: number;
  /** Tokens dont les journaux ont été relus. Sert à dire sur quoi porte la somme. */
  pools: number;
  /**
   * Le détail par token. La liste des lancements en a besoin pour classer par
   * volume et afficher une variation — sans quoi chaque carte devrait appeler
   * l'API séparément, soit une relecture complète des journaux par carte.
   */
  tokens: TokenActivity[];
};

/**
 * Le total du launchpad : la même relecture, pour chaque pool du registre.
 *
 * Les détenteurs ne sont volontairement pas sommés. Une même personne peut
 * tenir dix tokens, et additionner les comptes par token la compterait dix
 * fois — un « nombre d'utilisateurs » gonflé, du genre de ceux qu'on retire
 * plutôt que d'expliquer.
 */
async function protocolActivity(): Promise<ProtocolActivity> {
  const launches = await readLaunches();

  const perPool = await Promise.all(
    launches.map(async (launch) => {
      try {
        const token0 = await publicClient.readContract({
          address: launch.pool,
          abi: poolAbi,
          functionName: "token0",
        });
        const activity = await readActivity({
          token: launch.address,
          pool: launch.pool,
          tokenIsToken0: token0.toLowerCase() === launch.address.toLowerCase(),
        });
        return { launch, activity };
      } catch {
        // Un pool illisible ne doit pas annuler le total des autres.
        return null;
      }
    })
  );

  const read = perPool.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    volumeTotal: read.reduce((sum, { activity }) => sum + activity.volumeTotal, 0),
    volume24h: read.reduce((sum, { activity }) => sum + activity.volume24h, 0),
    trades: read.reduce((sum, { activity }) => sum + activity.trades, 0),
    trades24h: read.reduce((sum, { activity }) => sum + activity.trades24h, 0),
    pools: read.length,
    tokens: read.map(({ launch, activity }) => ({
      address: launch.address.toLowerCase(),
      volume24h: activity.volume24h,
      volumeTotal: activity.volumeTotal,
      trades: activity.trades,
      holders: activity.holders,
      change24h: activity.change24h,
    })),
  };
}

export async function GET() {
  if (!isDeployed) {
    return NextResponse.json({ error: "No launcher deployed" }, { status: 503 });
  }
  try {
    const activity = await unstable_cache(protocolActivity, ["activity", "all"], {
      revalidate: REVALIDATE,
    })();
    return NextResponse.json(activity);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Read failed" },
      { status: 502 }
    );
  }
}
