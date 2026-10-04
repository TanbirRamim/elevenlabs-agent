"use client";

import type { Outcome } from "@shadow/schema";
import { ACTION_LABELS } from "@/components/desk/ActionBar";
import { Badge } from "@/components/ui";
import type { LearnerPredictionResponse } from "@/lib/api";

const CHOICES = Object.keys(ACTION_LABELS) as Outcome[];

export interface PredictPanelProps {
  ticketId: string;
  condition: string;
  voiceLive: boolean;
  pending: boolean;
  result: LearnerPredictionResponse | null;
  error: string | null;
  onChoose: (outcome: Outcome) => void;
}

/** The `[PREDICT]` prompt: the learner commits to a decision before acting on the ticket. */
export function PredictPanel({
  ticketId,
  condition,
  voiceLive,
  pending,
  result,
  error,
  onChoose,
}: PredictPanelProps) {
  return (
    <section
      aria-label="Predict the decision"
      className="relative overflow-hidden rounded-panel border border-rule bg-surface px-5 py-5 sm:px-6"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ask" />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-2 text-ask-text">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ask" />
          Shadow asks
        </span>
        <span>
          Judgment point on ticket{" "}
          <span className="font-mono text-[0.8125rem] text-ink">{ticketId}</span>
        </span>
      </p>
      <h2 className="mt-2 text-base leading-snug font-semibold text-ink">
        What would you do here, and why?
      </h2>
      <p className="mt-1.5 max-w-[42rem] text-[0.9375rem] leading-relaxed text-ink-muted">
        {voiceLive
          ? "Tell Shadow, then mark your prediction."
          : "Mark your prediction before you act."}{" "}
        This ticket touches: <span className="text-ink">{condition}</span>.
      </p>
      {result ? (
        <div className="mt-4 border-t border-rule pt-4">
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] text-ink">
            {result.correct ? "Right: " : "Not quite. The expert would choose "}
            <Badge tone={result.correct ? "ok" : "neutral"}>
              {ACTION_LABELS[result.expectedOutcome]}
            </Badge>
          </p>
          <blockquote className="mt-3 text-base leading-snug text-pretty text-ink">
            “{result.reasonQuote}”
          </blockquote>
        </div>
      ) : (
        <fieldset className="mt-4">
          <legend className="sr-only">Your prediction</legend>
          <div className="flex flex-wrap gap-2">
            {CHOICES.map((o) => (
              <button
                key={o}
                type="button"
                disabled={pending}
                onClick={() => onChoose(o)}
                className="inline-flex min-h-10 items-center rounded-control border border-rule-strong bg-canvas px-3 text-sm text-ink transition-colors duration-150 enabled:hover:border-ink disabled:opacity-45"
              >
                {ACTION_LABELS[o]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
