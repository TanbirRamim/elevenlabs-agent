import type { ReactNode } from "react";
import { Button } from "../ui";

export interface TeachBackCardProps {
  /** Null while the teach-back is being prepared. */
  text: string | null;
  /** True when `text` is the one-sentence re-check after a correction. */
  recheck: boolean;
  /** Corrections applied so far and the maximum allowed. */
  round: number;
  maxRounds: number;
  /** "reading": Confirm/Correct; "correcting": the correction input is shown. */
  mode: "reading" | "correcting";
  busy: boolean;
  onConfirm: () => void;
  onCorrect: () => void;
  onCancelCorrection: () => void;
  /** The correction input (an AnswerBox), shown in "correcting" mode. */
  correction?: ReactNode;
}

/** Shadow's explanation of the workflow, read back for the expert to confirm or correct. */
export function TeachBackCard(props: TeachBackCardProps) {
  const { text, recheck, round, maxRounds, mode, busy } = props;
  const correctionsLeft = Math.max(0, maxRounds - round);

  return (
    <section
      aria-labelledby="teachback-title"
      className="overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
        <h3 id="teachback-title" className="text-sm font-medium text-ink-muted">
          {recheck ? "Re-check" : "Teach-back"}
        </h3>
        {round > 0 && (
          <span className="font-mono text-xs text-ink-faint">
            {round} {round === 1 ? "correction" : "corrections"} applied
          </span>
        )}
      </div>

      <div className="px-5 py-6 sm:px-6">
        {text === null ? (
          <p className="text-[0.9375rem] text-ink-faint" aria-live="polite">
            Shadow is putting together what it learned…
          </p>
        ) : (
          <blockquote className="max-w-[40ch] font-display text-[1.375rem] leading-snug text-pretty text-ink sm:text-[1.5rem]">
            {text}
          </blockquote>
        )}
      </div>

      {text !== null && mode === "reading" && (
        <div className="flex flex-col gap-3 border-t border-rule bg-sunken/60 px-5 py-4">
          <p className="text-[0.9375rem] text-ink-muted">
            Is that how it works? Say yes or tell Shadow what is wrong, or use the buttons.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={props.onConfirm} disabled={busy}>
              {busy ? "Saving…" : "Yes, that's right"}
            </Button>
            <Button
              variant="secondary"
              onClick={props.onCorrect}
              disabled={busy || correctionsLeft === 0}
            >
              Correct it
            </Button>
          </div>
          {correctionsLeft === 0 && (
            <p className="text-sm text-ink-faint">
              Both corrections are used. Confirm to continue; anything else can be fixed on the Work
              Map page.
            </p>
          )}
        </div>
      )}

      {text !== null && mode === "correcting" && (
        <div className="flex flex-col gap-3 border-t border-rule bg-sunken/60 px-5 py-4">
          {props.correction}
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onCancelCorrection}
            disabled={busy}
            className="self-start"
          >
            Back, it was right after all
          </Button>
        </div>
      )}
    </section>
  );
}
