import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../ui/cx";
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
    <section aria-labelledby="prediction-title" className="flex flex-col gap-3">
      <h3 id="prediction-title" className="text-sm font-medium text-ink-muted">
        Prediction check
      </h3>
      {variants === null ? (
        <p className="text-[0.9375rem] text-ink-faint" aria-live="polite">
          Shadow is picking tickets it has not seen…
        </p>
      ) : (
        <ol className="border-y border-rule">
          {variants.map((v, i) => {
            const mark = marks[v.id];
            const current = v.id === currentId;
            const title = stepTitle(v.becauseStepId);
            return (
              <li
                key={v.id}
                aria-current={current ? "step" : undefined}
                className={cx(
                  "relative border-t border-rule py-4 pr-3 pl-4 first:border-t-0",
                  current && "bg-ask-wash/50",
                )}
              >
                {current ? (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ask" />
                ) : null}
                <p className="font-mono text-xs text-ink-faint">
                  Prediction {i + 1} of {variants.length}
                </p>
                <p className="mt-1.5 text-base leading-snug text-ink">{v.description}</p>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                  Shadow would{" "}
                  <strong className="font-medium text-ink">
                    {outcomePhrase(v.predictedOutcome)}
                  </strong>
                  , because of {title ? `“${title}”` : `step ${v.becauseStepId}`}.
                </p>
                <fieldset className="mt-3 flex flex-wrap items-center gap-2">
                  <legend className="sr-only">Is prediction {i + 1} right?</legend>
                  <MarkButton
                    pressed={mark === "right"}
                    tone="ok"
                    disabled={readOnly}
                    onClick={() => onMark(v.id, "right")}
                  >
                    Right
                  </MarkButton>
                  <MarkButton
                    pressed={mark === "wrong"}
                    tone="danger"
                    disabled={readOnly}
                    onClick={() => onMark(v.id, "wrong")}
                  >
                    Wrong
                  </MarkButton>
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** A right/wrong toggle. Pressed shows the status tone and a check; the label carries the meaning. */
function MarkButton({
  pressed,
  tone,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  tone: "ok" | "danger";
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-10 items-center gap-1.5 rounded-control border px-3.5 text-sm font-medium transition-colors duration-150 disabled:cursor-default",
        pressed
          ? tone === "ok"
            ? "border-transparent bg-ok-wash text-ok"
            : "border-transparent bg-danger-wash text-danger"
          : "border-rule-strong text-ink hover:border-ink disabled:text-ink-faint disabled:hover:border-rule-strong",
      )}
    >
      {pressed ? <Check aria-hidden="true" className="size-4" /> : null}
      {children}
    </button>
  );
}
