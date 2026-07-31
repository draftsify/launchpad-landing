import { NextResponse } from "next/server";

import { activeChain, isDeployed, publicClient, siteUrl } from "@/lib/chain";
import { tokenAbi } from "@/lib/launcher";
import { parseMetadata } from "@/lib/metadata";
import { linksMuted } from "@/lib/hidden";

/**
 * Les métadonnées d'un token, dans la forme que le reste du monde lit.
 *
 * Même document que celui du contrat, mais avec `image` pointant sur une URL
 * plutôt que sur un data URI de 8 Ko. C'est la seule différence, et c'est celle
 * qui compte : un agrégateur ou un portefeuille sait charger une URL, aucun ne
 * sait appeler `metadataURI()` sur un contrat qu'il ne connaît pas.
 *
 * Les noms de champs suivent la convention des métadonnées NFT — `name`,
 * `symbol`, `description`, `image`, `external_url` — parce qu'elle est comprise
 * partout, pas parce qu'un token Reveal serait un NFT.
 */
export const revalidate = 3600;

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

  const token = address as `0x${string}`;
  const base = { address: token, abi: tokenAbi } as const;

  try {
    const [name, symbol, uri, decimals] = await Promise.all([
      publicClient.readContract({ ...base, functionName: "name" }),
      publicClient.readContract({ ...base, functionName: "symbol" }),
      publicClient.readContract({ ...base, functionName: "metadataURI" }),
      publicClient.readContract({ ...base, functionName: "decimals" }),
    ]);

    const meta = parseMetadata(uri);
    // Même retrait que dans l'interface : ce que le site ne montre pas, il ne
    // le republie pas non plus sous une forme plus commode.
    const links: Record<string, string> = {};
    if (!linksMuted(token)) {
      if (meta?.website) links.website = `https://${meta.website}`;
      if (meta?.x) links.x = `https://x.com/${meta.x}`;
      if (meta?.telegram) links.telegram = `https://t.me/${meta.telegram}`;
      if (meta?.discord) links.discord = `https://${meta.discord}`;
    }

    return NextResponse.json(
      {
        chainId: activeChain.id,
        address: token,
        name,
        symbol,
        decimals,
        description: meta?.description,
        // Servie par nous, mais décodée depuis le contrat à chaque fois : cette
        // URL n'ajoute aucune source de vérité, elle change juste de transport.
        image: meta?.image ? `${siteUrl()}/api/token/${token}/image` : undefined,
        external_url: `${siteUrl()}/token/${token}`,
        links,
      },
      { headers: { "access-control-allow-origin": "*" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Read failed" },
      { status: 502 }
    );
  }
}
