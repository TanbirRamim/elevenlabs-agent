import type { GateDecision } from "@/lib/turnGate";

export type GateReason = Extract<GateDecision, { open: false }>["reason"];

/** One plain sentence per Turn Gate reason, readable from the back of a room. */
export const REASON_SENTENCES: Record<GateReason, string> = {
  off_record: "Off the record",
  agent_speaking: "Singoda AI is speaking",
  user_speaking: "Expert is speaking",
  user_typing: "Expert is typing",
  screen_changing: "Screen is still changing",
  no_candidate: "No question worth asking yet",
  low_priority: "Best question is not worth the interruption",
  stale_candidate: "Best question is out of date",
  too_soon: "Last question was asked too recently",
  budget_spent: "Question budget for these 10 minutes is spent",
};

export const OPEN_SENTENCE = "Gate open: Singoda AI may ask now";

export function reasonSentence(decision: GateDecision): string {
  return decision.open ? OPEN_SENTENCE : REASON_SENTENCES[decision.reason];
}
