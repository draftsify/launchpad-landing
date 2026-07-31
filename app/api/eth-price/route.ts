import { NextResponse } from "next/server";

/**
 * Le prix de l'ETH en dollars.
 *
 * Côté serveur, et non depuis le navigateur : la valeur est la même pour tout
 * le monde, donc un cache partagé la sert une fois pour tous plutôt qu'une fois
 * par visiteur — et la clé d'un fournisseur, si un jour il en faut une, ne se
 * promène pas dans le bundle.
 *
 * C'est la seule donnée du site qui ne vienne pas de la chaîne, et il faut le
 * dire : un prix en dollars est une conversion faite par un tiers, pas un fait
 * on-chain. Quand la source ne répond pas, on rend `null` et l'interface
 * retombe sur l'ETH — afficher un dollar périmé serait pire que de ne pas en
 * afficher.
 */
export const revalidate = 300;

export async function GET() {
  try {
    const response = await fetch(
      "https://api.coinbase.com/v2/prices/ETH-USD/spot",
      { next: { revalidate: 300 } }
    );
    if (!response.ok) throw new Error(`upstream ${response.status}`);

    const body = (await response.json()) as { data?: { amount?: string } };
    const usd = Number(body.data?.amount);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error("no price");

    return NextResponse.json(
      { usd, source: "coinbase" },
      { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=1800" } }
    );
  } catch {
    return NextResponse.json({ usd: null, source: null }, { status: 200 });
  }
}
