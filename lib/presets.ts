export type Rules = {
  /** Part vendable dès le premier bloc, en %. */
  initialUnlock: number;
  /** Durée jusqu'au déblocage complet, en heures. */
  unlockHours: number;
  /** Plafond d'impact par fenêtre, en % de la liquidité. */
  impactCap: number;
  /** Fenêtre du plafond, en minutes. */
  impactWindow: number;
  /** Délai avant le premier achat, en secondes. */
  launchDelay: number;
  /** Montée progressive de la taille d'achat, en minutes. */
  buyRamp: number;
};

export type Preset = {
  id: string;
  label: string;
  summary: string;
  rules: Rules;
};

export const PRESETS: Preset[] = [
  {
    id: "balanced",
    label: "Balanced",
    summary: "A sensible default for most launches.",
    rules: {
      initialUnlock: 10,
      unlockHours: 24,
      impactCap: 1,
      impactWindow: 5,
      launchDelay: 30,
      buyRamp: 10,
    },
  },
  {
    id: "patient",
    label: "Patient",
    summary: "Slower release, tighter caps. For long-horizon projects.",
    rules: {
      initialUnlock: 5,
      unlockHours: 72,
      impactCap: 0.5,
      impactWindow: 5,
      launchDelay: 60,
      buyRamp: 20,
    },
  },
  {
    id: "fast",
    label: "Fast",
    summary: "Closest to an unrestricted launch, with a thin safety net.",
    rules: {
      initialUnlock: 25,
      unlockHours: 6,
      impactCap: 2,
      impactWindow: 5,
      launchDelay: 15,
      buyRamp: 5,
    },
  },
];

export function formatDuration(hours: number) {
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24}d`;
  return `${hours}h`;
}
