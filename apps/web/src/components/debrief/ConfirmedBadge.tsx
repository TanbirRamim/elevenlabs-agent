import { mmss } from "../../lib/voice/protocol";

export interface ConfirmedBadgeProps {
  /** Session time the teach-back was confirmed; null when it was not. */
  confirmedAtMs: number | null;
}

/** "Confirmed at 07:42": the expert signed off on Shadow's teach-back at this session time. */
export function ConfirmedBadge({ confirmedAtMs }: ConfirmedBadgeProps) {
  if (confirmedAtMs === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Teach-back not confirmed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Confirmed at <time className="tabular-nums">{mmss(confirmedAtMs)}</time>
    </span>
  );
}
