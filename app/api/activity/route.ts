import { NextResponse } from "next/server";

import { protocolActivity } from "@/lib/activity";
import { isDeployed } from "@/lib/chain";

/**
 * Le total du launchpad.
 *
 * Sans cache propre, volontairement. Envelopper cette route dans un
 * `unstable_cache` de plus emboîterait les caches par token à l'intérieur du
 * sien : mesuré, les entrées créées là-dedans ne servaient plus à la fiche d'un
 * token, qui relisait tout depuis zéro. Chaque morceau est déjà mis en cache
 * pour son propre compte, et c'est ce qui les rend partageables.
 */
export async function GET() {
  if (!isDeployed) {
    return NextResponse.json({ error: "No launcher deployed" }, { status: 503 });
  }
  try {
    return NextResponse.json(await protocolActivity());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Read failed" },
      { status: 502 }
    );
  }
}
