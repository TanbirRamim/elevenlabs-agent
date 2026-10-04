"use client";

import type { Step } from "@shadow/schema";
import { Scale, ShieldAlert } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { cx } from "../ui";
import { formatMs } from "./format";

/**
 * The steps in session order, Gong-style: session time in a fixed mono column, a numbered node
 * on a 1px rail, then the step. Judgment calls get a guard-toned node and a marker; the
 * selected step is set on `bg-selected` with an ink edge. ↑/↓ move between steps.
 */
export function StepTimeline({
  steps,
  selectedId,
  onSelect,
}: {
  steps: Step[];
  selectedId: string | null;
  /** `source` is "key" for arrow-key moves, so the page does not scroll focus away. */
  onSelect: (id: string, source?: "key" | "click") => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "j") next = Math.min(steps.length - 1, idx + 1);
    else if (e.key === "ArrowUp" || e.key === "k") next = Math.max(0, idx - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = steps.length - 1;
    const step = steps[next];
    if (!step) return;
    e.preventDefault();
    onSelect(step.id, "key");
    refs.current[next]?.focus();
  };

  return (
    <ol aria-label="Steps" className="flex flex-col py-1">
      {steps.map((step, idx) => {
        const selected = step.id === selectedId;
        const last = idx === steps.length - 1;
        return (
          <li key={step.id} className="relative">
            <button
              ref={(el) => {
                refs.current[idx] = el;
              }}
              type="button"
              onClick={() => onSelect(step.id, "click")}
              onKeyDown={(e) => onKeyDown(e, idx)}
              aria-current={selected ? "step" : undefined}
              className={cx(
                "group relative grid w-full grid-cols-[3rem_1.5rem_minmax(0,1fr)] gap-x-2.5 py-2.5 pr-4 pl-3 text-left transition-colors duration-100 focus-visible:-outline-offset-2",
                selected ? "bg-selected" : "hover:bg-hover",
              )}
            >
              {selected ? (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />
              ) : null}
              <span className="figures pt-0.5 font-mono text-xs text-ink-faint">
                <span className="sr-only">Step {step.order}, at </span>
                <time>{formatMs(step.moment.tMs)}</time>
              </span>
              <span aria-hidden="true" className="relative flex justify-center">
                {/* The rail, drawn per row so it runs node to node. */}
                <span
                  className={cx(
                    "absolute top-0 left-1/2 w-px -translate-x-1/2 bg-rule-strong",
                    idx === 0 ? "top-3" : "-top-2.5",
                    last ? "h-3" : "-bottom-2.5",
                  )}
                />
                <span
                  className={cx(
                    "figures relative inline-flex size-6 items-center justify-center rounded-full border font-mono text-2xs font-medium",
                    selected
                      ? "border-ink bg-ink text-ink-inverse"
                      : step.judgmentCall
                        ? "border-guard bg-guard-wash text-guard-text"
                        : "border-rule-strong bg-surface text-ink-muted",
                  )}
                >
                  {step.order}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-ui font-medium text-ink">{step.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-ui text-ink-muted">
                  {step.decision}
                </span>
                {step.judgmentCall || step.guardrailIds.length > 0 ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {step.judgmentCall ? (
                      <span className="inline-flex items-center gap-1 font-medium text-guard-text">
                        <Scale aria-hidden="true" className="size-3 stroke-2" />
                        Judgment call
                      </span>
                    ) : null}
                    {step.guardrailIds.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-ink-faint">
                        <ShieldAlert aria-hidden="true" className="size-3 stroke-2" />
                        <span className="font-mono">{step.guardrailIds.join(" ")}</span>
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
