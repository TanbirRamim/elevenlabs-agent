"use client";

import type { MasteryReport } from "@shadow/schema";
import { Stat, StatGroup } from "@/components/ui";
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
      className="rounded-panel border border-rule bg-surface px-5 py-6 sm:px-8"
    >
      <h2 className="text-base leading-tight font-semibold text-ink">Mastery</h2>
      <StatGroup className="mt-6 grid-cols-3">
        <Stat value={counts.independent} label="independent" />
        <Stat value={counts.assisted} label="assisted" />
        <Stat value={counts.missed} label="missed" />
      </StatGroup>
      {report.practiceNext.length > 0 && (
        <p className="mt-6 border-t border-rule pt-4 text-[0.9375rem] text-ink-muted">
          Practice next:{" "}
          {report.practiceNext.map((id, i) => (
            <span key={id}>
              {i > 0 ? ", " : ""}
              <span className="font-mono text-[0.8125rem] text-ink">{id}</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
