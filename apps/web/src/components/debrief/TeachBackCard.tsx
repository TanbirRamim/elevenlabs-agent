import { Check, PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, Button } from "../ui";

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
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-rule px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name="Shadow" shadow size="xs" />
          <h3 id="teachback-title" className="text-ui font-semibold text-ink">
            {recheck ? "Re-check" : "Teach-back"}
          </h3>
          <span className="hidden text-xs text-ink-faint sm:inline">
            {recheck ? "the corrected rule, in one sentence" : "how Shadow understood your work"}
          </span>
        </div>
        {round > 0 && (
          <span className="figures shrink-0 font-mono text-xs text-ink-faint">
            {round} {round === 1 ? "correction" : "corrections"} applied
          </span>
        )}
      </header>

      <div className="px-4 py-4">
        {text === null ? (
          <p className="text-ui text-ink-faint" aria-live="polite">
            Shadow is putting together what it learned…
          </p>
        ) : (
          <blockquote className="max-w-prose border-l-2 border-ask pl-3 text-base text-pretty text-ink">
            {text}
          </blockquote>
        )}
      </div>

      {text !== null && mode === "reading" && (
        <div className="flex flex-col gap-3 border-t border-rule bg-sunken px-4 py-3">
          <p className="text-ui text-ink-muted">
            Is that how it works? Say yes or tell Shadow what is wrong, or use the buttons.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={props.onConfirm} disabled={busy} icon={<Check />}>
              {busy ? "Saving…" : "Yes, that's right"}
            </Button>
            <Button
              variant="secondary"
              onClick={props.onCorrect}
              disabled={busy || correctionsLeft === 0}
              icon={<PencilLine />}
            >
              Correct it
            </Button>
          </div>
          {correctionsLeft === 0 ? (
            <p className="text-xs text-ink-faint">
              Both corrections are used. Confirm to continue; anything else can be fixed on the Work
              Map page.
            </p>
          ) : (
            <p className="text-xs text-ink-faint">
              {correctionsLeft} {correctionsLeft === 1 ? "correction" : "corrections"} left
            </p>
          )}
        </div>
      )}

      {text !== null && mode === "correcting" && (
        <div className="flex flex-col gap-3 border-t border-rule bg-sunken px-4 py-3">
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
