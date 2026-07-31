import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Le jalon d'un lancement, sous le nom du protocole.
 *
 * « Revealed » plutôt que « graduated » parce que le mot doit dire ce qui s'est
 * passé ici, et pas ce qui se passe ailleurs : sur la plupart des launchpads,
 * franchir ce seuil déplace la liquidité vers un autre pool. Ici rien ne bouge
 * — même token, même pool, même position verrouillée. Emprunter leur vocabulaire
 * ferait attendre leur comportement.
 *
 * Ce n'est pas un signal de qualité, et l'infobulle le dit plutôt que de le
 * laisser supposer par une pastille verte.
 */
export function RevealedBadge({ className }: { className?: string }) {
  return (
    <span
      title="Crossed the 4.2 ETH threshold. Nothing migrated: same token, same pool, same locked position."
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        "border-foreground/20 bg-foreground/5 text-foreground",
        className
      )}
    >
      <GraduationCap aria-hidden className="size-3" />
      Revealed
    </span>
  );
}
