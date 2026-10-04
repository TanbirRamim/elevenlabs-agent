import { Check, Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../ui/cx";
import { Progress } from "../ui/Progress";
import { Spinner } from "../ui/Spinner";
import { type ProcessingStatus, processingProgress } from "./logic";

/**
 * One post-session step. Conventional ids, in order: `transcript`, `redaction`, `workmap`
 * (Work Map draft), `verification`.
 */
export type ProcessingStep = {
  id: string;
  label: string;
  status: ProcessingStatus;
  detail?: ReactNode;
  /** 0..1 for the running step when known; omit for an indeterminate bar. */
  progress?: number;
};

export type ProcessingStepsProps = {
  steps: readonly ProcessingStep[];
  title?: string;
  className?: string;
};

const STATUS_WORD: Record<ProcessingStatus, string> = {
  waiting: "Waiting",
  running: "In progress",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

export function ProcessingSteps({
  steps,
  title = "Processing the session",
  className,
}: ProcessingStepsProps) {
  const p = processingProgress(steps);
  const summary = p.failed
    ? `Stopped at ${p.failed.label}`
    : p.complete
      ? "All steps done"
      : `${p.done} of ${p.total} steps`;

  return (
    <section
      aria-label={title}
      className={cx("rounded-panel border border-rule bg-surface", className)}
    >
      <header className="flex flex-col gap-2 border-b border-rule px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-ui font-semibold text-ink">{title}</h2>
          <span
            className={cx("figures text-xs", p.failed ? "text-danger" : "text-ink-muted")}
            aria-live="polite"
          >
            {summary}
          </span>
        </div>
        <Progress
          label="Overall progress"
          value={p.done}
          max={Math.max(1, p.total)}
          valueText={`${p.done} of ${p.total} steps`}
          tone={p.complete ? "ok" : "ink"}
        />
      </header>
      <ol aria-label="Steps" className="px-4 py-2">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={step.id} className="relative flex gap-3 pb-3 last:pb-1">
              {last ? null : (
                <span
                  aria-hidden="true"
                  className="absolute top-6 bottom-0 left-[9.5px] w-px bg-rule"
                />
              )}
              <span
                aria-hidden="true"
                className={cx(
                  "relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                  step.status === "done" && "border-transparent bg-ok-wash text-ok",
                  step.status === "failed" && "border-transparent bg-danger-wash text-danger",
                  step.status === "running" && "border-rule-strong bg-surface text-ink",
                  step.status === "waiting" && "border-rule bg-surface text-ink-faint",
                  step.status === "skipped" && "border-rule bg-sunken text-ink-faint",
                )}
              >
                {step.status === "done" ? (
                  <Check className="size-3 stroke-[2.5]" />
                ) : step.status === "failed" ? (
                  <X className="size-3 stroke-[2.5]" />
                ) : step.status === "running" ? (
                  <Spinner className="size-3" />
                ) : step.status === "skipped" ? (
                  <Minus className="size-3 stroke-[2.5]" />
                ) : (
                  <span className="figures font-mono text-2xs">{i + 1}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-ui">
                  <span
                    className={cx(
                      "font-medium",
                      step.status === "waiting" || step.status === "skipped"
                        ? "text-ink-muted"
                        : "text-ink",
                    )}
                  >
                    {step.label}
                  </span>
                  <span
                    className={cx(
                      "text-xs",
                      step.status === "failed"
                        ? "text-danger"
                        : step.status === "done"
                          ? "text-ok"
                          : "text-ink-faint",
                    )}
                  >
                    {STATUS_WORD[step.status]}
                  </span>
                </p>
                {step.detail ? (
                  <p className="mt-0.5 text-xs text-ink-muted">{step.detail}</p>
                ) : null}
                {step.status === "running" ? (
                  <Progress
                    label={step.label}
                    value={typeof step.progress === "number" ? step.progress * 100 : undefined}
                    className="mt-2 max-w-xs"
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
