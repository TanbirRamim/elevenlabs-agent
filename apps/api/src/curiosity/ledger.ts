import type { Outcome, PublicTicket } from "@shadow/schema";

export type GapSlot = "reason" | "guardrail" | "exception" | "escalation_contact";

export interface Gap {
  id: string;
  ticketId: string;
  slot: GapSlot;
  openedAtMs: number;
  outcome: Outcome;
  surprise: 0.5 | 1;
  /** Set when a question about this gap was asked (starts the 30 s answer window). */
  askedAtMs?: number;
  questionId?: string;
  questionText?: string;
  /** Expert segments that answered the question; non-empty = filled. */
  answerSegmentIds: string[];
}

const SLOT_WEIGHT: Record<GapSlot, number> = {
  guardrail: 1.0,
  reason: 0.8,
  exception: 0.6,
  escalation_contact: 0.6,
};

/** Cues that make a screenAnswer count as already answering a slot. */
const SLOT_CUES: Record<GapSlot, string[]> = {
  reason: ["because", "reason"],
  guardrail: ["never", "rule", "limit", "approval", "must not"],
  exception: ["exception", "unless"],
  escalation_contact: ["contact", "escalate to", "reach"],
};

/**
 * §6.5 surprise: 1.0 when the outcome differs from the naive one — money is in
 * play but no refund happened, or the naive reply became a handoff/escalation.
 */
export function surpriseOf(ticket: PublicTicket | undefined, outcome: Outcome): 0.5 | 1 {
  const moneyInPlay =
    ticket?.amountEur !== undefined || /refund|charge|€|\beur\b/i.test(ticket?.body ?? "");
  if (moneyInPlay && outcome !== "refund") return 1;
  if (!moneyInPlay && (outcome.startsWith("handoff_") || outcome.startsWith("escalate_"))) return 1;
  return 0.5;
}

/** A decision opens a step hypothesis: guardrail (required) + reason + exception (+ contact for handoffs). */
export function gapsForDecision(
  ticket: PublicTicket | undefined,
  ticketId: string,
  outcome: Outcome,
  tMs: number,
  nextId: () => string,
): Gap[] {
  const surprise = surpriseOf(ticket, outcome);
  const slots: GapSlot[] = ["guardrail", "reason", "exception"];
  if (outcome.startsWith("handoff_")) slots.push("escalation_contact");
  return slots.map((slot) => ({
    id: nextId(),
    ticketId,
    slot,
    openedAtMs: tMs,
    outcome,
    surprise,
    answerSegmentIds: [],
  }));
}

/** Linear decay 1 -> 0 over 60 s from the gap's opening. */
export function recencyOf(gap: Gap, nowMs: number): number {
  return Math.max(0, 1 - (nowMs - gap.openedAtMs) / 60_000);
}

/** 1 when a screenAnswer names the ticket and cues the slot — the screen already answers it. */
export function screenAnswerableOf(gap: Gap, screenAnswers: readonly string[]): 0 | 1 {
  const cues = SLOT_CUES[gap.slot];
  const hit = screenAnswers.some((answer) => {
    const a = answer.toLowerCase();
    return a.includes(gap.ticketId.toLowerCase()) && cues.some((c) => a.includes(c));
  });
  return hit ? 1 : 0;
}

/** §6.5: slotWeight × surprise × (1 − screenAnswerable) × recency. */
export function priorityOf(
  gap: Gap,
  { nowMs, screenAnswers }: { nowMs: number; screenAnswers: readonly string[] },
): number {
  return (
    SLOT_WEIGHT[gap.slot] *
    gap.surprise *
    (1 - screenAnswerableOf(gap, screenAnswers)) *
    recencyOf(gap, nowMs)
  );
}
