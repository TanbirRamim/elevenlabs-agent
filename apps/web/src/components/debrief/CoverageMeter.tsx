import { Badge } from "../ui";
import { cx } from "../ui/cx";

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
    <section aria-labelledby="coverage-label">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 id="coverage-label" className="text-sm font-medium text-ink-muted">
            Coverage
          </h3>
          <p className="mt-1 text-sm text-ink-faint">
            {answered} debrief {answered === 1 ? "answer" : "answers"}, target {targetPct}%
          </p>
        </div>
        <span className="flex items-center gap-3">
          {done && (
            <Badge tone="ok" dot>
              Done
            </Badge>
          )}
          <span className="font-display text-[2.25rem] leading-none tracking-[-0.02em] tabular-nums">
            {pct}
            <span className="text-xl text-ink-faint">%</span>
          </span>
        </span>
      </div>
      {/* A precise rule, not a pill: hairline track, 2px fill, a tick at the target. */}
      <div
        role="progressbar"
        aria-labelledby="coverage-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% covered, target ${targetPct}%`}
        className="relative mt-4 h-3"
      >
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-rule-strong" />
        <div
          aria-hidden="true"
          className={cx(
            "absolute inset-x-0 top-1/2 h-0.5 origin-left transition-transform duration-500 ease-arrive",
            done ? "bg-ok" : "bg-ink",
          )}
          style={{ transform: `translateY(-50%) scaleX(${pct / 100})` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-ink-muted"
          style={{ left: `${targetPct}%` }}
        />
      </div>
      <div aria-hidden="true" className="relative mt-1 h-4 font-mono text-xs text-ink-faint">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${targetPct}%` }}>
          {targetPct}
        </span>
      </div>
    </section>
  );
}
