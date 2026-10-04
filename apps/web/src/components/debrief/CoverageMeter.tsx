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
    <section aria-labelledby="coverage-label" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="coverage-label" className="text-xs font-medium text-ink-muted">
            Coverage
          </h3>
          <p className="mt-0.5 text-xs text-ink-faint">
            {answered} debrief {answered === 1 ? "answer" : "answers"}, target {targetPct}%
          </p>
        </div>
        <span className="flex items-center gap-2">
          {done && (
            <Badge tone="ok" dot>
              Done
            </Badge>
          )}
          <span className="figures text-2xl leading-8 font-semibold text-ink">
            {pct}
            <span className="text-ui font-normal text-ink-faint">%</span>
          </span>
        </span>
      </div>
      {/* A 4px track with the done-rule target marked; no stripes, no glow. */}
      <div
        role="progressbar"
        aria-labelledby="coverage-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% covered, target ${targetPct}%`}
        className="relative h-3"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-pill bg-rule"
        >
          <div
            className={cx(
              "h-full origin-left rounded-pill transition-transform duration-200 ease-out",
              done ? "bg-ok-fill" : "bg-ink",
            )}
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-ink-muted"
          style={{ left: `${targetPct}%` }}
        />
      </div>
      <div aria-hidden="true" className="relative h-4 font-mono text-2xs text-ink-faint">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${targetPct}%` }}>
          {targetPct}
        </span>
      </div>
    </section>
  );
}
