export interface CoverageMeterProps {
  /** 0..1 */
  coverage: number;
  /** Debrief questions answered so far. */
  answered: number;
  done: boolean;
  /** Coverage the done rule needs (§6.7: 0.9). */
  target?: number;
}

/** How much of the workflow the draft map explains, with the done-rule target marked. */
export function CoverageMeter({ coverage, answered, done, target = 0.9 }: CoverageMeterProps) {
  const pct = Math.round(Math.min(1, Math.max(0, coverage)) * 100);
  const targetPct = Math.round(target * 100);
  return (
    <section aria-labelledby="coverage-label" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="coverage-label" className="text-sm font-medium">
          Coverage
        </h3>
        <span className="text-sm tabular-nums text-neutral-600 dark:text-neutral-300">
          {pct}%
          {done && (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Done
            </span>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="coverage-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% covered, target ${targetPct}%`}
        className="relative h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            done ? "bg-emerald-500" : "bg-sky-500"
          }`}
          style={{ width: `${pct}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-neutral-500"
          style={{ left: `${targetPct}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500">
        {answered} debrief {answered === 1 ? "answer" : "answers"} · target {targetPct}%
      </p>
    </section>
  );
}
