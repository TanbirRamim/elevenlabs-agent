import type { OpenQuestion } from "@shadow/schema";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "../ui/Avatar";
import { cx } from "../ui/cx";

export interface OpenQuestionListProps {
  questions: readonly OpenQuestion[];
  answeredIds: readonly string[];
  /** The question Singoda AI is asking now, if any. */
  currentId: string | null;
  /** Rendered inside the current question's row, e.g. the answer box. */
  answer?: ReactNode;
}

const SLOT_LABEL: Record<OpenQuestion["slot"], string> = {
  reason: "Reason",
  guardrail: "Guardrail",
  exception: "Exception",
  escalation_contact: "Escalation contact",
};

/**
 * The debrief as a conversation: Singoda AI's questions in order, the one it is asking now opened
 * up with the expert's answer box, answered ones checked off, the rest still open.
 */
export function OpenQuestionList({
  questions,
  answeredIds,
  currentId,
  answer,
}: OpenQuestionListProps) {
  if (questions.length === 0) {
    return <p className="text-ui text-ink-faint">No open questions.</p>;
  }
  return (
    <ol
      className="divide-y divide-rule overflow-hidden rounded-panel border border-rule bg-surface"
      aria-label="Debrief questions"
    >
      {questions.map((q, i) => {
        const answered = answeredIds.includes(q.id);
        const current = !answered && q.id === currentId;
        const status = answered ? "Answered" : current ? "Asking now" : "Open";
        return (
          <li
            key={q.id}
            aria-current={current ? "step" : undefined}
            className={cx(
              "relative grid grid-cols-[1.75rem_1fr] gap-3 px-4 py-3",
              current && "bg-ask-wash/60",
            )}
          >
            {current ? (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ask" />
            ) : null}
            <span className="pt-0.5">
              {current ? (
                <Avatar name="Singoda AI" shadow size="xs" />
              ) : answered ? (
                <span
                  aria-hidden="true"
                  className="inline-flex size-5 items-center justify-center rounded-full bg-ok-wash text-ok"
                >
                  <Check className="size-3 stroke-[2.5]" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="figures inline-flex size-5 items-center justify-center rounded-full border border-rule font-mono text-2xs text-ink-faint"
                >
                  {i + 1}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center justify-between gap-3 text-xs">
                <span className={current ? "font-medium text-ask-text" : "text-ink-faint"}>
                  {current ? "Singoda AI asks" : SLOT_LABEL[q.slot]}
                  {current ? (
                    <span className="font-normal text-ink-faint"> · {SLOT_LABEL[q.slot]}</span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "shrink-0",
                    answered ? "text-ok" : current ? "text-ask-text" : "text-ink-faint",
                  )}
                >
                  {status}
                </span>
              </div>
              <p
                className={cx(
                  "text-pretty",
                  current ? "text-base text-ink" : "text-ui",
                  answered ? "text-ink-muted" : "text-ink",
                )}
              >
                {q.text}
              </p>
              {current && answer ? <div className="mt-3">{answer}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
