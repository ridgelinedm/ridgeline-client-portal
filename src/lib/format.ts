// Shared metric formatters + delta colouring, used by the client dashboard
// widgets, the all-clients grid, and the explorers.

// Percent change as a decimal (0.25 = +25%). prev=0 → 0 if curr=0 else 1 (100%).
export function delta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 1;
  return (curr - prev) / prev;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString();
}

// Compact notation, e.g. 8.8K, 529.5K, 1.2M.
export function compact(n: number): string {
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

// 0–100 health score → traffic-light text colour.
export function healthColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// Delta → good/bad colour. `invert` flips it (e.g. avg position: lower is better).
export function deltaColor(d: number, invert = false): string {
  const isGood = invert ? d < 0 : d > 0;
  const isBad = invert ? d > 0 : d < 0;
  if (d === 0) return "text-zinc-400";
  if (isGood) return "text-emerald-600 dark:text-emerald-400";
  if (isBad) return "text-red-600 dark:text-red-400";
  return "text-zinc-400";
}
