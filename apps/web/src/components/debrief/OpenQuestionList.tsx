import type { OpenQuestion } from "@shadow/schema";
import { cx } from "../ui/cx";

export interface OpenQuestionListProps {
  questions: readonly OpenQuestion[];
  answeredIds: readonly string[];
  /** The question Shadow is asking now, if any. */
  currentId: string | null;
}

const SLOT_LABEL: Record<OpenQuestion["slot"], string> = {
  reason: "Reason",
  guardrail: "Guardrail",
  exception: "Exception",
  escalation_contact: "Escalation contact",
};

/** The debrief questions: answered ones, the one being asked, and the ones still open. */
export function OpenQuestionList({ questions, answeredIds, currentId }: OpenQuestionListProps) {
  if (questions.length === 0) {
    return <p className="text-[0.9375rem] text-ink-faint">No open questions.</p>;
  }
  return (
    <ol className="border-y border-rule" aria-label="Debrief questions">
      {questions.map((q, i) => {
        const answered = answeredIds.includes(q.id);
        const current = !answered && q.id === currentId;
        const status = answered ? "Answered" : current ? "Asking now" : "Open";
        return (
          <li
            key={q.id}
            aria-current={current ? "step" : undefined}
            className={cx(
              "relative grid grid-cols-[2rem_1fr] gap-3 border-t border-rule py-4 pr-3 pl-4 first:border-t-0",
              current && "bg-ask-wash/50",
            )}
          >
            {current ? (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ask" />
            ) : null}
            <span className="pt-0.5 font-mono text-xs text-ink-faint tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-faint">{SLOT_LABEL[q.slot]}</span>
                <span
                  className={cx(
                    "inline-flex items-center gap-1.5",
                    answered ? "text-ok" : current ? "text-ask-text" : "text-ink-faint",
                  )}
                >
                  {current ? (
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-ask" />
                  ) : null}
                  {status}
                </span>
              </div>
              <p
                className={cx(
                  "text-base leading-snug text-pretty",
                  answered ? "text-ink-muted" : "text-ink",
                )}
              >
                {q.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
