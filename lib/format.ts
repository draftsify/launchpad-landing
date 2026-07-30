export function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

export function formatCount(value: number) {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

/**
 * Montants en ETH, pas en dollars. Convertir supposerait un oracle de prix que
 * le protocole n'a pas et que cette interface n'a aucune raison d'introduire :
 * le pool est libellé en ETH, donc c'est en ETH que les chiffres sont exacts.
 */
export function formatEth(value: number) {
  if (value === 0) return "0 ETH";
  if (value < 0.0001) return `${value.toExponential(1)} ETH`;
  if (value < 1) return `${value.toFixed(4)} ETH`;
  if (value < 1_000) return `${value.toFixed(3)} ETH`;
  return `${Math.round(value).toLocaleString("en-US")} ETH`;
}

/** Quantité de tokens : les décimales n'apprennent rien sur un milliard. */
export function formatTokens(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return value.toFixed(2);
  return value.toPrecision(3);
}

/** Âge lisible depuis un horodatage en secondes. */
export function formatAge(launchedAt: number, now = Date.now()) {
  const seconds = Math.max(0, Math.floor(now / 1000) - launchedAt);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
