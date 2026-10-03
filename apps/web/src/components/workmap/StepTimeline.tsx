"use client";

import type { Step } from "@shadow/schema";
import { formatMs } from "./format";
import { JudgmentBadge } from "./primitives";

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
    <ol
      aria-label="Steps"
      className="relative space-y-1 border-l border-neutral-200 pl-5 dark:border-neutral-800"
    >
      {steps.map((step) => {
        const selected = step.id === selectedId;
        return (
          <li key={step.id} className="relative">
            <span
              aria-hidden="true"
              className={`absolute -left-[26px] top-3 h-2.5 w-2.5 rounded-full border-2 ${
                selected
                  ? "border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100"
                  : "border-neutral-400 bg-white dark:border-neutral-500 dark:bg-neutral-950"
              }`}
            />
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={selected ? "step" : undefined}
              className={`w-full rounded px-3 py-2 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-900 ${
                selected ? "bg-neutral-100 dark:bg-neutral-900" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs tabular-nums text-neutral-500">
                  {step.order}. <time>{formatMs(step.moment.tMs)}</time>
                </span>
                {step.judgmentCall && <JudgmentBadge />}
              </div>
              <div className="mt-0.5 font-medium">{step.title}</div>
              <div className="mt-0.5 text-sm text-neutral-500">{step.decision}</div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
