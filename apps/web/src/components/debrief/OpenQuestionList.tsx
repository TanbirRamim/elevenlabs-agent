import type { OpenQuestion } from "@shadow/schema";

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
    return <p className="text-sm text-neutral-500">No open questions.</p>;
  }
  return (
    <ol className="space-y-2" aria-label="Debrief questions">
      {questions.map((q) => {
        const answered = answeredIds.includes(q.id);
        const current = !answered && q.id === currentId;
        const status = answered ? "Answered" : current ? "Asking now" : "Open";
        return (
          <li
            key={q.id}
            aria-current={current ? "step" : undefined}
            className={`rounded-md border p-3 text-sm ${
              current
                ? "border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/40"
                : "border-neutral-200 dark:border-neutral-800"
            } ${answered ? "text-neutral-500" : ""}`}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-neutral-500">{SLOT_LABEL[q.slot]}</span>
              <span
                className={
                  answered
                    ? "font-medium text-emerald-700 dark:text-emerald-300"
                    : current
                      ? "font-medium text-sky-700 dark:text-sky-300"
                      : "text-neutral-500"
                }
              >
                {status}
              </span>
            </div>
            <p className={answered ? "line-through decoration-neutral-400" : ""}>{q.text}</p>
          </li>
        );
      })}
    </ol>
  );
}
