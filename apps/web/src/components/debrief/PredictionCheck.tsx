import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../ui/cx";
import type { PredictionMark, PredictionVariant } from "./machine";
import { outcomePhrase } from "./speech";

export interface PredictionCheckProps {
  /** Null while the variants are being prepared. */
  variants: readonly PredictionVariant[] | null;
  marks: Readonly<Record<string, PredictionMark>>;
  /** The prediction Singoda AI is stating now. */
  currentId: string | null;
  stepTitle: (stepId: string) => string | undefined;
  onMark: (variantId: string, mark: PredictionMark) => void;
  /** After the check is complete the marks are shown but cannot change. */
  readOnly?: boolean;
}

/** Prediction proof: Singoda AI predicts unseen variants; the expert marks each right or wrong. */
export function PredictionCheck({
  variants,
  marks,
  currentId,
  stepTitle,
  onMark,
  readOnly = false,
}: PredictionCheckProps) {
  return (
    <section aria-labelledby="prediction-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="prediction-title" className="text-ui font-semibold text-ink">
          Prediction check
        </h3>
        <span className="text-xs text-ink-faint">tickets Singoda AI has not seen</span>
      </div>
      {variants === null ? (
        <p className="text-ui text-ink-faint" aria-live="polite">
          Singoda AI is picking tickets it has not seen…
        </p>
      ) : (
        <ol className="divide-y divide-rule overflow-hidden rounded-panel border border-rule bg-surface">
          {variants.map((v, i) => {
            const mark = marks[v.id];
            const current = v.id === currentId;
            const title = stepTitle(v.becauseStepId);
            return (
              <li
                key={v.id}
                aria-current={current ? "step" : undefined}
                className={cx("relative px-4 py-3", current && "bg-ask-wash/60")}
              >
                {current ? (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ask" />
                ) : null}
                <p className="figures font-mono text-xs text-ink-faint">
                  Prediction {i + 1} of {variants.length}
                </p>
                <p className="mt-1 text-sm text-ink">{v.description}</p>
                <p className="mt-1 text-ui text-ink-muted">
                  Singoda AI would{" "}
                  <strong className="font-medium text-ink">
                    {outcomePhrase(v.predictedOutcome)}
                  </strong>
                  , because of {title ? `“${title}”` : `step ${v.becauseStepId}`}.
                </p>
                <fieldset className="mt-2.5 flex flex-wrap items-center gap-2">
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
        "inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-ui font-medium shadow-raised transition-colors duration-100 pointer-coarse:h-10 disabled:cursor-default disabled:shadow-none",
        pressed
          ? tone === "ok"
            ? "border-transparent bg-ok-wash text-ok"
            : "border-transparent bg-danger-wash text-danger"
          : "border-rule-strong bg-surface text-ink hover:bg-hover disabled:text-ink-faint disabled:hover:bg-surface",
      )}
    >
      {pressed ? <Check aria-hidden="true" className="size-3.5 stroke-2" /> : null}
      {children}
    </button>
  );
}
