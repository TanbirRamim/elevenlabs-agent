import { evaluate, type RuleRef } from "@shadow/guard";
import type {
  Guardrail,
  GuardVerdict,
  MachineRule,
  Outcome,
  PublicTicket,
  ScreenMoment,
  Step,
  WorkMap,
} from "@shadow/schema";

/**
 * Pure tutor logic for the Teach page (TAN-10). No React, no network: the page wires these
 * to the guard verdicts, the Work Map and the voice control protocol. Tested in logic.test.ts.
 */

export interface CitedGuardrails {
  /** Guardrails from the map, in the verdict's order (most severe first). */
  found: Guardrail[];
  /** Rule ids the guard cited that the map doesn't contain (e.g. fallback rules). */
  missing: string[];
}

/** Looks up the guardrails a verdict cites. Unknown ids are reported, never dropped silently. */
export function citedGuardrails(map: WorkMap | null, ruleIds: readonly string[]): CitedGuardrails {
  const found: Guardrail[] = [];
  const missing: string[] = [];
  for (const id of new Set(ruleIds)) {
    const g = map?.guardrails.find((x) => x.id === id);
    if (g) found.push(g);
    else missing.push(id);
  }
  return { found, missing };
}

/** The first step that lists this guardrail, preferring judgment calls. */
export function stepForGuardrail(map: WorkMap, guardrailId: string): Step | undefined {
  const steps = map.steps.filter((s) => s.guardrailIds.includes(guardrailId));
  return steps.find((s) => s.judgmentCall) ?? steps[0];
}

/** Payload of `[INTERVENE]` (agents/tutor.md). Null fields mean the map had no evidence for it. */
export interface InterventionPayload {
  ticketId: string;
  attemptedOutcome: Outcome;
  ruleIds: string[];
  quote: string | null;
  frameId: string | null;
  expectedOutcome: Outcome | null;
  condition: string | null;
  stepId: string | null;
}

export interface Intervention {
  payload: InterventionPayload;
  cited: CitedGuardrails;
  /**
   * The guardrail that decided the verdict (its first, most severe rule id), when the map has
   * it. Never substituted by a lesser cited rule: quoting the wrong rule would misteach.
   */
  primary: Guardrail | null;
  /** The expert's moment for the primary guardrail, for the Replay button. */
  moment: ScreenMoment | null;
}

/** Builds the intervention shown on screen and sent to the tutor after a BLOCK. */
export function buildIntervention(
  map: WorkMap | null,
  verdict: GuardVerdict,
  ticketId: string,
  attemptedOutcome: Outcome,
): Intervention {
  const cited = citedGuardrails(map, verdict.ruleIds);
  const primaryId = verdict.ruleIds[0];
  const first = cited.found.find((g) => g.id === primaryId) ?? null;
  const step = map && first ? stepForGuardrail(map, first.id) : undefined;
  const expected = verdict.expectedOutcome ?? first?.machineRule?.expectedOutcome ?? null;
  return {
    payload: {
      ticketId,
      attemptedOutcome,
      ruleIds: [...verdict.ruleIds],
      quote: first?.evidence.quote.text ?? null,
      frameId: first?.evidence.moment.frameId ?? null,
      expectedOutcome: expected,
      condition: first?.condition ?? null,
      stepId: step?.id ?? null,
    },
    cited,
    primary: first,
    moment: first?.evidence.moment ?? null,
  };
}

/** True when the ticket's own content (tags, text, amount, VIP) meets the rule's conditions. */
export function ticketMatchesRule(rule: MachineRule, ticket: PublicTicket): boolean {
  const { when } = rule;
  // Only rules about the ticket's content mark a judgment point; an action-only rule
  // (e.g. "any refund over 100") is the guard's job, not a prediction prompt.
  if (!when.anyTag?.length && !when.bodyMatchesAny?.length) return false;
  const text = `${ticket.subject}\n${ticket.body}`.toLowerCase();
  if (when.anyTag?.length && !when.anyTag.some((t) => ticket.tags.includes(t))) return false;
  if (
    when.bodyMatchesAny?.length &&
    !when.bodyMatchesAny.some((s) => text.includes(s.toLowerCase()))
  ) {
    return false;
  }
  if (
    when.amountEurAbove !== undefined &&
    !(ticket.amountEur !== undefined && ticket.amountEur > when.amountEurAbove)
  ) {
    return false;
  }
  if (when.vip !== undefined && when.vip !== ticket.customer.vip) return false;
  return true;
}

export interface JudgmentMatch {
  guardrail: Guardrail;
  step: Step | undefined;
  /** Id sent as `stepId` in `[PREDICT]` and the prediction: the step, else the guardrail. */
  predictId: string;
  expectedOutcome: Outcome | null;
}

const EFFECT_RANK = { BLOCK: 3, REQUIRE_APPROVAL: 2, WARN: 1 } as const;

/** The judgment point an opened ticket hits, if any: the most severe matching guardrail. */
export function matchJudgment(map: WorkMap, ticket: PublicTicket): JudgmentMatch | null {
  const hits = map.guardrails
    .filter((g) => g.machineRule && ticketMatchesRule(g.machineRule, ticket))
    .sort(
      (a, b) =>
        EFFECT_RANK[b.machineRule?.effect ?? "WARN"] - EFFECT_RANK[a.machineRule?.effect ?? "WARN"],
    );
  const guardrail = hits[0];
  if (!guardrail) return null;
  const step = stepForGuardrail(map, guardrail.id);
  return {
    guardrail,
    step,
    predictId: step?.id ?? guardrail.id,
    expectedOutcome: guardrail.machineRule?.expectedOutcome ?? null,
  };
}

/**
 * The expert's own words for a judgment point: the step's reason when a step lists the
 * guardrail, else the guardrail's evidence quote. Always a real quote from the map.
 */
export function expertReason(match: JudgmentMatch): string {
  return match.step?.reason.text ?? match.guardrail.evidence.quote.text;
}

/**
 * Payload of `[PREDICT]` (agents/tutor.md). Carries the expert's reason so the tutor can
 * confirm or correct the learner's answer in the expert's words (never before they answer).
 */
export function predictPayload(match: JudgmentMatch, ticketId: string) {
  return {
    stepId: match.predictId,
    ticketId,
    guardrailId: match.guardrail.id,
    condition: match.guardrail.condition,
    expertReason: expertReason(match),
    guardrailQuote: match.guardrail.evidence.quote.text,
  };
}

/** The learner's answer to a `[PREDICT]`, when they chose one on screen. */
export interface PredictionAnswer {
  predictedOutcome: Outcome;
  correct: boolean;
}

/**
 * Payload of `[EXPLAIN]` (agents/tutor.md): the step to explain the way the expert did it.
 * Sent once the learner has committed to a prediction, so the explanation never gives the
 * answer away first.
 */
export function explainPayload(
  match: JudgmentMatch,
  ticketId: string,
  expertName: string,
  answer: PredictionAnswer | null,
) {
  return {
    ticketId,
    stepId: match.predictId,
    stepTitle: match.step?.title ?? match.guardrail.condition,
    expertReason: expertReason(match),
    expertName,
    expectedOutcome: match.expectedOutcome,
    ...(answer
      ? { learnerPredicted: answer.predictedOutcome, learnerCorrect: answer.correct }
      : {}),
  };
}

/**
 * Rate limit for per-ticket tutor messages: `take(key)` is true the first time a key is seen,
 * false after that, so a re-opened or re-answered ticket never makes the tutor repeat itself.
 */
export function oncePerKey() {
  const seen = new Set<string>();
  return {
    take(key: string): boolean {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    /** Forgets a key whose message could not be delivered, so a later attempt may send it. */
    release(key: string): void {
      seen.delete(key);
    },
  };
}

export interface MomentRef {
  moment: ScreenMoment;
  quote: string;
  title: string;
}

/** The expert's moment for one guardrail, never confused with another that shares its frame. */
export function guardrailMoment(g: Guardrail): MomentRef {
  return { moment: g.evidence.moment, quote: g.evidence.quote.text, title: g.condition };
}

/**
 * Resolves a frame to a moment, preferring the guardrail that is being taught right now:
 * two guardrails can cite the same frame, and the replay must show the one that held the save.
 */
export function momentForFrame(
  map: WorkMap | null,
  frameId: string,
  prefer: Guardrail | null,
): MomentRef | null {
  if (prefer && prefer.evidence.moment.frameId === frameId) return guardrailMoment(prefer);
  return findMoment(map, frameId);
}

/** Resolves a `replay_clip({ frameId })` call to the expert's moment and words. */
export function findMoment(map: WorkMap | null, frameId: string): MomentRef | null {
  if (!map) return null;
  const g = map.guardrails.find((x) => x.evidence.moment.frameId === frameId);
  if (g) return { moment: g.evidence.moment, quote: g.evidence.quote.text, title: g.condition };
  const s = map.steps.find((x) => x.moment.frameId === frameId);
  if (s) return { moment: s.moment, quote: s.reason.text, title: s.title };
  return null;
}

/** Counts per status for the mastery summary. */
export function masteryCounts(
  entries: readonly { status: "independent" | "assisted" | "missed" }[],
) {
  const counts = { independent: 0, assisted: 0, missed: 0 };
  for (const e of entries) counts[e.status] += 1;
  return counts;
}

/**
 * Whether the predict callout shows: for the open ticket, unless a held save on that same
 * ticket is being explained. A held save on another ticket does not hide it, so the learner
 * still gets the predict step on the next unseen ticket after resolving (or leaving) one.
 */
export function showPredictFor(
  predictTicketId: string | null,
  openTicketId: string | null,
  interventionTicketId: string | null,
): boolean {
  return (
    predictTicketId !== null &&
    predictTicketId === openTicketId &&
    interventionTicketId !== openTicketId
  );
}

/** The outcomes a guided first click may try, most telling first: a refund is the classic slip. */
export const GUIDED_OUTCOMES: readonly Outcome[] = [
  "refund",
  "close",
  "reply",
  "escalate_tier2",
  "escalate_engineering",
  "hold_request_info",
  "handoff_billing_disputes",
  "handoff_security",
  "handoff_legal",
];

export interface GuidedStartPick {
  ticketId: string;
  outcome: Outcome;
  /** The rule that would hold the save, as the loaded rules cite it (any id scheme). */
  ruleId: string;
}

/**
 * The guided first click: the first ticket (queue order) whose save a loaded rule would BLOCK,
 * trying a refund on every ticket before any other outcome. Works for any rule ids: it only asks
 * the guard. Rules stand in for the judge here (the reference rules cover judge-only guardrails).
 */
export function pickGuidedStart(
  tickets: readonly PublicTicket[],
  rules: readonly RuleRef[],
  outcomes: readonly Outcome[] = GUIDED_OUTCOMES,
): GuidedStartPick | null {
  for (const outcome of outcomes) {
    for (const ticket of tickets) {
      const verdict = evaluate({ ticket, outcome }, rules);
      const ruleId = verdict.ruleIds[0];
      if (verdict.decision === "BLOCK" && ruleId) return { ticketId: ticket.id, outcome, ruleId };
    }
  }
  return null;
}
