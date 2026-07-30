import Image from "next/image";

import { LOGO_RATIOS } from "@/lib/logo-ratios";
import { cn } from "@/lib/utils";

type Slug = keyof typeof LOGO_RATIOS;

const LEFT: Slug[] = [
  "wallet-metamask",
  "wallet-rabby",
  "wallet-rainbow",
  "wallet-ledger",
];
/**
 * EVM uniquement. Phantom et Solflare figuraient ici : ce sont des wallets
 * Solana, et Robinhood Chain est une chaîne Ethereum — les afficher promettait
 * une compatibilité qui n'existe pas.
 */
const RIGHT: Slug[] = [
  "uniswap",
  "ethereum",
  "wallet-wallet-connect",
  "wallet-zerion",
];

function Tile({ slug, size = 22 }: { slug: Slug; size?: number }) {
  return (
    <span className="flex size-12 items-center justify-center rounded-xl border bg-card">
      <Image
        src={`/logos/${slug}.svg`}
        alt=""
        width={Math.round(size * LOGO_RATIOS[slug])}
        height={size}
        unoptimized
        className="select-none object-contain"
        style={{ height: size, width: "auto" }}
      />
    </span>
  );
}

/**
 * Reprise du bloc integrations-4 : les tuiles sont reliées par des tiges
 * verticales à une règle horizontale, montante à gauche, descendante à droite.
 */
function Column({
  slugs,
  direction,
}: {
  slugs: Slug[];
  direction: "up" | "down";
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center gap-3 sm:gap-4",
        direction === "up" ? "pt-12" : "pb-12"
      )}
    >
      {/* Règle horizontale à laquelle les tiges se raccrochent. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 h-px bg-border",
          direction === "up" ? "top-0" : "bottom-0"
        )}
      />
      {slugs.map((slug) => (
        <div key={slug} className="relative">
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-1/2 h-12 w-px -translate-x-1/2 bg-border",
              direction === "up" ? "-top-12" : "-bottom-12"
            )}
          />
          <Tile slug={slug} />
        </div>
      ))}
    </div>
  );
}

export function StackRow() {
  return (
    <div className="grid grid-cols-1 items-center gap-8 px-4 py-10 lg:grid-cols-3">
      <div className="order-2 lg:order-1">
        <Column slugs={LEFT} direction="up" />
      </div>

      <div className="order-1 space-y-3 text-center lg:order-2">
        <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Works with what you already use
        </h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Bring your own wallet, trade against familiar liquidity. Reveal only
          changes the rules of the sell side.
        </p>
      </div>

      <div className="order-3">
        <Column slugs={RIGHT} direction="down" />
      </div>
    </div>
  );
}
