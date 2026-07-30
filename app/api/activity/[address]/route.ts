import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { isDeployed, publicClient } from "@/lib/chain";
import { readActivity } from "@/lib/indexer";
import { tokenAbi } from "@/lib/launcher";
import { poolAbi } from "@/lib/uniswap";

/**
 * L'activité d'un token, relue depuis les journaux du pool.
 *
 * Côté serveur, et non dans le navigateur, pour deux raisons. La lecture peut
 * ramener des milliers de journaux : la faire par visiteur les téléchargerait
 * autant de fois, et martèlerait un nœud public gratuit. Et le résultat est le
 * même pour tout le monde — c'est exactement ce qu'un cache partagé sait faire.
 *
 * Trente secondes : au-delà, un graphique de prix ment sur un marché qui bouge ;
 * en deçà, on relit des journaux qui n'ont pas changé.
 */
const REVALIDATE = 30;

async function activityOf(address: `0x${string}`) {
  const [pool, token0] = await (async () => {
    const p = await publicClient.readContract({
      address,
      abi: tokenAbi,
      functionName: "pool",
    });
    const t0 = await publicClient.readContract({
      address: p,
      abi: poolAbi,
      functionName: "token0",
    });
    return [p, t0] as const;
  })();

  return readActivity({
    token: address,
    pool,
    tokenIsToken0: token0.toLowerCase() === address.toLowerCase(),
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isDeployed) {
    return NextResponse.json({ error: "No launcher deployed" }, { status: 503 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Not an address" }, { status: 400 });
  }

  const key = address.toLowerCase();
  try {
    const activity = await unstable_cache(
      () => activityOf(key as `0x${string}`),
      ["activity", key],
      { revalidate: REVALIDATE }
    )();
    return NextResponse.json(activity);
  } catch (error) {
    // Un nœud qui refuse doit se dire, pas se traduire en zéros : une page qui
    // affiche « 0 trade » alors que la lecture a échoué invente un fait.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Read failed" },
      { status: 502 }
    );
  }
}
