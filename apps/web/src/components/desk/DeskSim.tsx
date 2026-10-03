"use client";

import { DESK_ROOT_ID, type DeskSimProps } from "./types";

/**
 * Placeholder that honours the DeskSimProps contract so host pages can integrate from H0.
 * Owner: Harshit (task HAR-1). Replace the body; keep the props and the root id.
 */
export function DeskSim({ tickets, mode }: DeskSimProps) {
  return (
    <section
      id={DESK_ROOT_ID}
      className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700"
    >
      <p className="text-sm text-neutral-500">
        DeskSim ({mode}) · {tickets.length} tickets
      </p>
    </section>
  );
}
