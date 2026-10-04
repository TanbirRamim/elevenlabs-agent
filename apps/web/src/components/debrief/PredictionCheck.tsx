import type { PredictionMark, PredictionVariant } from "./machine";
import { outcomePhrase } from "./speech";

export interface PredictionCheckProps {
  /** Null while the variants are being prepared. */
  variants: readonly PredictionVariant[] | null;
  marks: Readonly<Record<string, PredictionMark>>;
  /** The prediction Shadow is stating now. */
  currentId: string | null;
  stepTitle: (stepId: string) => string | undefined;
  onMark: (variantId: string, mark: PredictionMark) => void;
  /** After the check is complete the marks are shown but cannot change. */
  readOnly?: boolean;
}

/** Prediction proof: Shadow predicts unseen variants; the expert marks each right or wrong. */
export function PredictionCheck({
  variants,
  marks,
  currentId,
  stepTitle,
  onMark,
  readOnly = false,
}: PredictionCheckProps) {
  return (
    <section
      aria-labelledby="prediction-title"
      className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h3 id="prediction-title" className="text-sm font-medium">
        Prediction check
      </h3>
      {variants === null ? (
        <p className="text-sm text-neutral-500" aria-live="polite">
          Shadow is picking tickets it has not seen…
        </p>
      ) : (
        <ol className="space-y-3">
          {variants.map((v, i) => {
            const mark = marks[v.id];
            const current = v.id === currentId;
            const title = stepTitle(v.becauseStepId);
            return (
              <li
                key={v.id}
                aria-current={current ? "step" : undefined}
                className={`rounded-md border p-3 text-sm ${
                  current
                    ? "border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/40"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <p className="text-xs text-neutral-500">
                  Prediction {i + 1} of {variants.length}
                </p>
                <p className="mt-1">{v.description}</p>
                <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                  Shadow would <strong>{outcomePhrase(v.predictedOutcome)}</strong>, because of{" "}
                  {title ? `“${title}”` : `step ${v.becauseStepId}`}.
                </p>
                <fieldset className="mt-2 flex flex-wrap items-center gap-2">
                  <legend className="sr-only">Is prediction {i + 1} right?</legend>
                  <button
                    type="button"
                    aria-pressed={mark === "right"}
                    disabled={readOnly}
                    onClick={() => onMark(v.id, "right")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-default ${
                      mark === "right"
                        ? "bg-emerald-700 text-white"
                        : "border border-neutral-300 dark:border-neutral-700"
                    }`}
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    aria-pressed={mark === "wrong"}
                    disabled={readOnly}
                    onClick={() => onMark(v.id, "wrong")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-default ${
                      mark === "wrong"
                        ? "bg-red-700 text-white"
                        : "border border-neutral-300 dark:border-neutral-700"
                    }`}
                  >
                    Wrong
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
