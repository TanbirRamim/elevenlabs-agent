import type { Guardrail, Quote } from "@shadow/schema";

/** Session time as mm:ss (hours roll into minutes, e.g. 75:02). */
export function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatClip([startMs, endMs]: readonly [number, number]): string {
  return `${formatMs(startMs)}–${formatMs(endMs)}`;
}

export const GUARDRAIL_TYPES: readonly Guardrail["type"][] = [
  "limit",
  "exception",
  "stop_and_ask",
  "never",
];

export const GUARDRAIL_TYPE_LABEL: Record<Guardrail["type"], string> = {
  limit: "Limit",
  exception: "Exception",
  stop_and_ask: "Stop and ask",
  never: "Never",
};

export const SPEAKER_LABEL: Record<Quote["speaker"], string> = {
  expert: "Expert",
  new_hire: "New hire",
  agent: "Shadow",
};

export const SOURCE_LABEL: Record<Quote["source"], string> = {
  live_question: "answering a live question",
  think_aloud: "thinking aloud",
  debrief: "in the debrief",
  teach_back: "in the teach-back",
};

export const OPEN_QUESTION_SLOT_LABEL = {
  reason: "Reason",
  guardrail: "Guardrail",
  exception: "Exception",
  escalation_contact: "Escalation contact",
} as const;
