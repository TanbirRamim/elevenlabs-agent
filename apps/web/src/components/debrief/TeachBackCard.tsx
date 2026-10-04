import type { ReactNode } from "react";

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
      className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="teachback-title" className="text-sm font-medium">
          {recheck ? "Re-check" : "Teach-back"}
        </h3>
        {round > 0 && (
          <span className="text-xs text-neutral-500">
            {round} {round === 1 ? "correction" : "corrections"} applied
          </span>
        )}
      </div>

      {text === null ? (
        <p className="text-sm text-neutral-500" aria-live="polite">
          Shadow is putting together what it learned…
        </p>
      ) : (
        <blockquote className="border-l-2 border-sky-400 pl-3 text-sm leading-relaxed">
          {text}
        </blockquote>
      )}

      {text !== null && mode === "reading" && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Is that how it works? Say yes or tell Shadow what is wrong, or use the buttons.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={props.onConfirm}
              disabled={busy}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Saving…" : "Yes, that's right"}
            </button>
            <button
              type="button"
              onClick={props.onCorrect}
              disabled={busy || correctionsLeft === 0}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40 dark:border-neutral-700"
            >
              Correct it
            </button>
          </div>
          {correctionsLeft === 0 && (
            <p className="text-xs text-neutral-500">
              Both corrections are used. Confirm to continue; anything else can be fixed on the Work
              Map page.
            </p>
          )}
        </div>
      )}

      {text !== null && mode === "correcting" && (
        <div className="space-y-2">
          {props.correction}
          <button
            type="button"
            onClick={props.onCancelCorrection}
            disabled={busy}
            className="text-sm text-neutral-600 underline disabled:opacity-40 dark:text-neutral-300"
          >
            Back, it was right after all
          </button>
        </div>
      )}
    </section>
  );
}
