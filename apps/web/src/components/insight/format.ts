/** Pure formatting helpers for the Insight panel. All times are session milliseconds. */

/** "3.2 s ago", or "never" when the signal has not fired yet. */
export function formatAgo(nowMs: number, lastMs: number | null): string {
  if (lastMs === null) return "never";
  const seconds = Math.max(0, nowMs - lastMs) / 1000;
  return `${seconds.toFixed(1)} s ago`;
}

/** "1.5 s" for a duration. */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

/** "mm:ss" session clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 0.94 → "94%"; null → "—". */
export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${Math.round(ratio * 100)}%`;
}

/** 1234.5 → "1235 ms"; null → "—". */
export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return `${Math.round(ms)} ms`;
}
