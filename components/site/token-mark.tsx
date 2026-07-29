import Image from "next/image";

import type { Token } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { tile: "size-8 rounded-lg", logo: "h-3", text: "text-[10px]" },
  lg: {
    tile: "size-20 rounded-2xl sm:size-24",
    logo: "h-9 sm:h-11",
    text: "text-xl sm:text-2xl",
  },
} as const;

/**
 * Vignette d'un token. Sans image, on retombe sur les deux premières lettres
 * du ticker plutôt que sur un carré vide : la plupart des lancements n'auront
 * pas de logo au moment du déploiement.
 */
export function TokenMark({
  token,
  size = "lg",
  className,
}: {
  token: Token;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border bg-muted/50",
        s.tile,
        className
      )}
    >
      {token.logo ? (
        <Image
          src={token.logo}
          alt=""
          width={512}
          height={287}
          className={cn("w-auto select-none", s.logo)}
        />
      ) : (
        <span
          aria-hidden
          className={cn("font-medium tracking-tight text-foreground/70", s.text)}
        >
          {token.ticker.slice(0, 2)}
        </span>
      )}
    </span>
  );
}
