import { NextResponse } from "next/server";

import { activityOf } from "@/lib/activity";
import { isDeployed } from "@/lib/chain";

/**
 * L'activité d'un token, relue depuis les journaux du pool.
 *
 * Côté serveur, et non dans le navigateur, pour deux raisons. La lecture peut
 * ramener des milliers de journaux : la faire par visiteur les téléchargerait
 * autant de fois, et martèlerait un nœud public gratuit. Et le résultat est le
 * même pour tout le monde — c'est exactement ce qu'un cache partagé sait faire.
 */
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

  try {
    return NextResponse.json(await activityOf(address as `0x${string}`));
  } catch (error) {
    // Un nœud qui refuse doit se dire, pas se traduire en zéros : une page qui
    // affiche « 0 trade » alors que la lecture a échoué invente un fait.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Read failed" },
      { status: 502 }
    );
  }
}
