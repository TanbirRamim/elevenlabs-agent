"use client";

import type { Outcome } from "@shadow/schema";
import { ACTION_LABELS } from "@/components/desk/ActionBar";
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
      className="rounded-lg border border-sky-300 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-sky-800 dark:text-sky-300">
        Judgment point · ticket {ticketId}
      </p>
      <h2 className="mt-1 text-base font-semibold text-neutral-900 dark:text-neutral-50">
        What would you do here, and why?
      </h2>
      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
        {voiceLive
          ? "Tell Shadow, then mark your prediction."
          : "Mark your prediction before you act."}{" "}
        This ticket touches: {condition}.
      </p>
      {result ? (
        <p className="mt-3 text-sm text-neutral-900 dark:text-neutral-100">
          {result.correct ? "Right: " : "Not quite. The expert would choose "}
          <strong>{ACTION_LABELS[result.expectedOutcome]}</strong>. “{result.reasonQuote}”
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {CHOICES.map((o) => (
            <button
              key={o}
              type="button"
              disabled={pending}
              onClick={() => onChoose(o)}
              className="rounded border border-neutral-400 bg-white px-2.5 py-1 text-sm text-neutral-900 enabled:hover:bg-neutral-100 disabled:opacity-50"
            >
              {ACTION_LABELS[o]}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </section>
  );
}
