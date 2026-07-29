import { cn } from "@/lib/utils";

const LAYERS = 8;

/**
 * Flou progressif sur un bord : au lieu d'un simple dégradé opaque, on empile
 * des couches de `backdrop-filter` dont la fenêtre de masque glisse, ce qui
 * fond le contenu au lieu de le recouvrir.
 */
export function ProgressiveBlur({
  direction = "left",
  className,
}: {
  direction?: "left" | "right";
  className?: string;
}) {
  const angle = direction === "left" ? 270 : 90;

  return (
    <div aria-hidden className={cn("pointer-events-none", className)}>
      {Array.from({ length: LAYERS }, (_, i) => {
        const step = 100 / (LAYERS + 1);
        const start = i * step;
        return (
          <div
            key={i}
            className="pointer-events-none absolute inset-0"
            style={{
              maskImage: `linear-gradient(${angle}deg, rgba(255,255,255,0) ${start}%, rgb(255,255,255) ${start + step}%, rgb(255,255,255) ${start + step * 2}%, rgba(255,255,255,0) ${start + step * 3}%)`,
              WebkitMaskImage: `linear-gradient(${angle}deg, rgba(255,255,255,0) ${start}%, rgb(255,255,255) ${start + step}%, rgb(255,255,255) ${start + step * 2}%, rgba(255,255,255,0) ${start + step * 3}%)`,
              backdropFilter: `blur(${i}px)`,
              WebkitBackdropFilter: `blur(${i}px)`,
            }}
          />
        );
      })}
    </div>
  );
}
