"use client";

import type { MasteryReport } from "@shadow/schema";
import { masteryCounts } from "./logic";

/**
 * Reserved slot for the mastery report. `MasteryReport.tsx` (built on its own branch)
 * replaces this summary; the Teach page passes it the same `report` prop.
 */
export function MasteryReportSlot({ report }: { report: MasteryReport }) {
  const counts = masteryCounts(report.entries);
  return (
    <section
      aria-label="Mastery report"
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h2 className="text-base font-semibold">Mastery</h2>
      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
        {counts.independent} independent · {counts.assisted} assisted · {counts.missed} missed
      </p>
      {report.practiceNext.length > 0 && (
        <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
          Practice next: {report.practiceNext.join(", ")}
        </p>
      )}
    </section>
  );
}
