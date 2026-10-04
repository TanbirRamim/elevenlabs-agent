"use client";

import type { Outcome } from "@shadow/schema";
import { CircleCheck, CircleDot } from "lucide-react";
import { ACTION_LABELS, ACTION_ORDER } from "@/components/desk/ActionBar";
import { Avatar, Badge, cx, Spinner } from "@/components/ui";
import type { LearnerPredictionResponse } from "@/lib/api";

export interface PredictPanelProps {
  ticketId: string;
  condition: string;
  expertName?: string;
  voiceLive: boolean;
  pending: boolean;
  /** The outcome the learner picked, once they picked. */
  chosen?: Outcome | null;
  result: LearnerPredictionResponse | null;
  error: string | null;
  onChoose: (outcome: Outcome) => void;
}

/**
 * The `[PREDICT]` prompt, anchored beside the open ticket's actions: the learner commits to a
 * decision before acting, then sees the expert's answer in the expert's words.
 */
export function PredictPanel({
  ticketId,
  condition,
  expertName = "The expert",
  voiceLive,
  pending,
  chosen = null,
  result,
  error,
  onChoose,
}: PredictPanelProps) {
  return (
    <section aria-label="Predict the decision" className="px-4 py-4 @3xl:px-5">
      <div className="flex items-start gap-3">
        <Avatar name="Shadow" shadow size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ask-text">
            Shadow asks · judgment point on <span className="font-mono">{ticketId}</span>
          </p>
          <h3 className="mt-0.5 text-base leading-6 font-semibold text-ink">
            What would you do here?
          </h3>
          <p className="mt-0.5 text-ui text-ink-muted">
            This ticket touches <span className="text-ink">{condition}</span>.{" "}
            {result
              ? null
              : voiceLive
                ? "Tell Shadow why, then mark your call."
                : "Mark your call before you act."}
          </p>
        </div>
      </div>

      {result ? (
        <div className="mt-3 @3xl:pl-11" aria-live="polite">
          <div
            className={cx(
              "rounded-panel border p-3",
              result.correct ? "border-ok/30 bg-ok-wash" : "border-rule bg-sunken",
            )}
          >
            <p className="flex flex-wrap items-center gap-2 text-ui text-ink">
              {result.correct ? (
                <>
                  <CircleCheck aria-hidden="true" className="size-4 stroke-[1.75] text-ok" />
                  <span className="font-semibold text-ok">Right call.</span>
                  <span>{expertName} chooses</span>
                </>
              ) : (
                <>
                  <CircleDot aria-hidden="true" className="size-4 stroke-[1.75] text-ink-muted" />
                  <span className="font-semibold">Not quite.</span>
                  {chosen ? (
                    <span className="text-ink-muted">
                      You picked <span className="line-through">{ACTION_LABELS[chosen]}</span>.
                    </span>
                  ) : null}
                  <span>{expertName} chooses</span>
                </>
              )}
              <Badge tone={result.correct ? "ok" : "neutral"}>
                {ACTION_LABELS[result.expectedOutcome]}
              </Badge>
            </p>
            <blockquote className="mt-2 border-l-2 border-rule-strong pl-3 text-base leading-relaxed text-pretty text-ink">
              “{result.reasonQuote}”
            </blockquote>
          </div>
        </div>
      ) : (
        <fieldset className="m-0 mt-3 min-w-0 border-0 p-0 @3xl:pl-11">
          <legend className="sr-only">Your prediction</legend>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_ORDER.map((o) => (
              <button
                key={o}
                type="button"
                disabled={pending}
                aria-pressed={chosen === o}
                onClick={() => onChoose(o)}
                className={cx(
                  "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-control border px-3 text-ui transition-colors duration-100 pointer-coarse:h-10",
                  chosen === o
                    ? "border-ink bg-selected text-ink"
                    : "border-rule-strong bg-surface text-ink enabled:hover:bg-hover",
                  "disabled:opacity-60",
                )}
              >
                {ACTION_LABELS[o]}
                {pending && chosen === o ? <Spinner /> : null}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-ui text-danger @3xl:pl-11">
          {error}
        </p>
      ) : null}
    </section>
  );
}
