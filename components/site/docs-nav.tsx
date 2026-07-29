"use client";

import { useEffect, useState } from "react";

import { DOC_NAV } from "@/lib/docs";
import { cn } from "@/lib/utils";

/**
 * Navigation latérale des docs. La section active suit le défilement plutôt
 * que le clic : ouvrir un lien profond ou remonter à la molette laisse le
 * sommaire juste, ce qu'un simple état sur le clic ne ferait pas.
 */
export function DocsNav() {
  const [active, setActive] = useState(DOC_NAV[0].items[0].id);

  useEffect(() => {
    const ids = DOC_NAV.flatMap((group) => group.items.map((i) => i.id));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // On retient la section visible la plus haute, sinon deux sections
        // à l'écran se disputent l'état actif à chaque frame.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // La bande étroite en haut de l'écran fait basculer l'état quand une
      // section atteint le tiers supérieur, pas quand elle effleure le bas.
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Documentation" className="space-y-6">
      {DOC_NAV.map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-3 text-[11px] tracking-wide text-muted-foreground uppercase">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = item.id === active;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-3.5 shrink-0" />
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
