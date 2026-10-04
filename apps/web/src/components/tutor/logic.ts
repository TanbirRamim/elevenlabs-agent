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

/** Payload of `[PREDICT]` (agents/tutor.md). */
export function predictPayload(match: JudgmentMatch, ticketId: string) {
  return {
    stepId: match.predictId,
    ticketId,
    guardrailId: match.guardrail.id,
    condition: match.guardrail.condition,
  };
}

export interface MomentRef {
  moment: ScreenMoment;
  quote: string;
  title: string;
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
