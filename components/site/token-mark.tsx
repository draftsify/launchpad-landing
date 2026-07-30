import Image from "next/image";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: { tile: "size-8 rounded-lg", text: "text-[10px]" },
  md: { tile: "size-12 rounded-xl", text: "text-sm" },
  lg: { tile: "size-20 rounded-2xl sm:size-24", text: "text-xl sm:text-2xl" },
} as const;

/**
 * Vignette d'un token. Sans image, on retombe sur les deux premières lettres du
 * symbole plutôt que sur un carré vide : beaucoup de lancements n'auront pas de
 * logo.
 *
 * L'image vient du `metadataURI`, donc d'un data URI écrit dans le contrat.
 * `unoptimized` est nécessaire : l'optimiseur de Next attend une URL qu'il peut
 * aller chercher, et il n'y a rien à aller chercher ici.
 */
export function TokenMark({
  symbol,
  image,
  size = "lg",
  className,
}: {
  symbol: string;
  image?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border bg-muted/50",
        s.tile,
        className
      )}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          width={128}
          height={128}
          unoptimized
          className="size-full select-none object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn("font-medium tracking-tight text-foreground/70", s.text)}
        >
          {symbol.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
