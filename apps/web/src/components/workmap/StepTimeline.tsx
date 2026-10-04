"use client";

import type { Step } from "@shadow/schema";
import { cx } from "../ui";
import { formatMs } from "./format";
import { JudgmentBadge } from "./primitives";

/** The steps in order, hung from a numbered rail. Judgment calls are marked on the rail too. */
export function StepTimeline({
  steps,
  selectedId,
  onSelect,
}: {
  steps: Step[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ol aria-label="Steps" className="relative flex flex-col">
      {/* The rail the steps hang from. */}
      <span
        aria-hidden="true"
        className="absolute top-4 bottom-4 left-[15px] w-px bg-rule-strong"
      />
      {steps.map((step) => {
        const selected = step.id === selectedId;
        return (
          <li key={step.id} className="relative pl-12">
            <span
              aria-hidden="true"
              className={cx(
                "absolute top-3 left-0 inline-flex size-[31px] items-center justify-center rounded-full border font-mono text-xs tabular-nums transition-colors duration-150",
                selected
                  ? "border-ink bg-ink text-canvas"
                  : step.judgmentCall
                    ? "border-signal bg-signal-wash text-signal-text"
                    : "border-rule-strong bg-canvas text-ink-muted",
              )}
            >
              {String(step.order).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={selected ? "step" : undefined}
              className={cx(
                "my-1 w-full rounded-panel border px-4 py-3 text-left transition-colors duration-150",
                selected
                  ? "border-rule-strong bg-surface"
                  : "border-transparent hover:border-rule hover:bg-surface/60",
              )}
            >
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-ink-faint tabular-nums">
                  <span className="sr-only">Step {step.order}, </span>
                  <time>{formatMs(step.moment.tMs)}</time>
                </span>
                {step.judgmentCall && <JudgmentBadge />}
              </span>
              <span className="mt-1.5 block text-[1.0625rem] leading-snug font-medium text-ink">
                {step.title}
              </span>
              <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-muted">
                {step.decision}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
