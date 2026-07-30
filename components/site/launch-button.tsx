import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

import { launchesOpen } from "@/lib/launch-gate";
import { Button } from "@/components/ui/button";

/**
 * Le seul chemin vers `/create`, dans les deux états.
 *
 * Neuf endroits du site proposaient « Launch a token ». Les fermer un par un
 * aurait laissé le prochain oublié derrière : ils passent tous par ici, donc la
 * porte n'a qu'un seul verrou.
 *
 * Fermé, le bouton reste visible et désactivé plutôt que retiré. Une page dont
 * les boutons disparaissent se lit comme cassée ; un bouton qui dit pourquoi il
 * ne marche pas se lit comme une date à attendre.
 */
export function LaunchButton({
  variant,
  size,
  className,
  onNavigate,
  icon,
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  onNavigate?: () => void;
  /** L'ornement de droite, quand le lien est ouvert. Flèche par défaut. */
  icon?: React.ReactNode;
}) {
  if (!launchesOpen) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled
        title="Reveal has not launched yet — token creation is not open."
      >
        <Lock />
        Not launched yet
      </Button>
    );
  }

  return (
    <Button variant={variant} size={size} className={className} asChild>
      <Link href="/create" onClick={onNavigate}>
        Launch a token
        {icon ?? <ArrowRight />}
      </Link>
    </Button>
  );
}
