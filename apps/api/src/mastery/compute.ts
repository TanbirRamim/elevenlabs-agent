import { matchesTicket, SEVERITY } from "@shadow/guard";
import type {
  Guardrail,
  MasteryReport,
  Outcome,
  PendingAction,
  Step,
  WorkMap,
} from "@shadow/schema";
import type { PredictionRecord, SessionRecord } from "../store/memory.js";

type VerdictRecord = SessionRecord["guardVerdicts"][number];

type TicketContent = PendingAction["ticket"];

export interface ResolvedPrediction {
  step: Step | null;
  guardrail: Guardrail | null;
  expectedOutcome: Outcome;
  reasonQuote: string;
  frameId: string;
}

export type ResolveError = "unknown_step" | "no_expected_outcome";

/** The ticket-content guardrails that fire for this ticket, most severe first. */
function firingGuardrails(guardrails: readonly Guardrail[], ticket: TicketContent): Guardrail[] {
  return guardrails
    .filter((g) => g.machineRule && matchesTicket(g.machineRule, ticket))
    .sort(
      (a, b) =>
        SEVERITY[b.machineRule?.effect ?? "WARN"] - SEVERITY[a.machineRule?.effect ?? "WARN"],
    );
}

/**
 * What the map says the learner should have predicted for `stepId` on this ticket.
 * `stepId` is a step id, or a guardrail id when no step lists the guardrail (the tutor's
 * `predictId`). The quote is the expert's words for the guardrail that applies to this ticket
 * when there is one (the unseen case is taught with its own rule), otherwise the step's reason.
 */
export function resolvePrediction(
  map: WorkMap,
  ticket: TicketContent,
  stepId: string,
): ResolvedPrediction | ResolveError {
  const direct = map.guardrails.find((g) => g.id === stepId);
  const step = direct ? null : (map.steps.find((s) => s.id === stepId) ?? null);
  if (!direct && !step) return "unknown_step";

  let guardrail: Guardrail | null = direct ?? null;
  if (step) {
    const own = map.guardrails.filter((g) => step.guardrailIds.includes(g.id));
    const withOutcome = own.filter((g) => g.machineRule?.expectedOutcome);
    guardrail =
      firingGuardrails(own, ticket).find((g) => g.machineRule?.expectedOutcome) ??
      (withOutcome.length === 1 ? (withOutcome[0] ?? null) : null);
  }
  const expectedOutcome = guardrail?.machineRule?.expectedOutcome;
  if (!expectedOutcome) return "no_expected_outcome";

  const quoteFrom = guardrail
    ? { quote: guardrail.evidence.quote.text, frameId: guardrail.evidence.moment.frameId }
    : null;
  return {
    step,
    guardrail,
    expectedOutcome,
    reasonQuote: quoteFrom?.quote ?? step?.reason.text ?? "",
    frameId: quoteFrom?.frameId ?? step?.moment.frameId ?? "",
  };
}

export interface Commit {
  ticketId: string;
  outcome: Outcome;
}

export interface MasteryInput {
  sessionId: string;
  map: WorkMap;
  predictions: readonly PredictionRecord[];
  verdicts: readonly VerdictRecord[];
  /** action_committed desk events, in order. */
  commits: readonly Commit[];
  /** Ticket content by id, to find the guardrails a committed ticket touched. */
  tickets: ReadonlyMap<string, TicketContent>;
}

interface Track {
  id: string;
  ticketId: string;
  expected: Outcome | null;
  wrong: boolean;
  lastPredictionCorrect: boolean | null;
  warned: Set<Outcome>;
  committed: Outcome | null;
}

/**
 * Mastery per step/guardrail touched in a teach session (§6.8, HAR-12):
 * - independent: right first time (correct prediction and/or correct save), never blocked;
 * - assisted: right in the end, after a wrong prediction or a BLOCK;
 * - missed: committed against a WARN, or never right.
 * `practiceNext` lists missed ids, then assisted ids.
 */
export function computeMastery(input: MasteryInput): MasteryReport {
  const { map, tickets } = input;
  const byId = new Map(map.guardrails.map((g) => [g.id, g]));
  const tracks = new Map<string, Track>();
  const track = (ticketId: string, id: string, expected: Outcome | null): Track => {
    const key = `${ticketId}\u0000${id}`;
    let t = tracks.get(key);
    if (!t) {
      t = {
        id,
        ticketId,
        expected,
        wrong: false,
        lastPredictionCorrect: null,
        warned: new Set(),
        committed: null,
      };
      tracks.set(key, t);
    }
    if (!t.expected && expected) t.expected = expected;
    return t;
  };

  for (const p of input.predictions) {
    const t = track(p.ticketId, p.guardrailId ?? p.stepId, p.expectedOutcome);
    t.lastPredictionCorrect = p.correct;
    if (!p.correct) t.wrong = true;
  }

  for (const { ticketId, outcome, verdict } of input.verdicts) {
    if (verdict.decision !== "BLOCK" && verdict.decision !== "WARN") continue;
    verdict.ruleIds.forEach((id, i) => {
      const g = byId.get(id);
      if (!g) return;
      const expected =
        (i === 0 ? verdict.expectedOutcome : undefined) ?? g.machineRule?.expectedOutcome ?? null;
      // A rule with no expected outcome (e.g. "needs approval") is not a right/wrong call.
      if (!expected || expected === outcome) return;
      const t = track(ticketId, id, expected);
      if (verdict.decision === "BLOCK") t.wrong = true;
      else t.warned.add(outcome);
    });
  }

  for (const c of input.commits) {
    const ticket = tickets.get(c.ticketId);
    if (ticket) {
      for (const g of firingGuardrails(map.guardrails, ticket)) {
        const expected = g.machineRule?.expectedOutcome;
        if (expected) track(c.ticketId, g.id, expected);
      }
    }
    for (const t of tracks.values()) if (t.ticketId === c.ticketId) t.committed = c.outcome;
  }

  const entries = [...tracks.values()].map((t) => {
    let status: "independent" | "assisted" | "missed";
    const right =
      t.committed !== null
        ? t.expected !== null && t.committed === t.expected
        : t.lastPredictionCorrect === true;
    if (t.committed !== null && t.warned.has(t.committed)) status = "missed";
    else if (!right) status = "missed";
    else status = t.wrong ? "assisted" : "independent";
    return { stepOrGuardrailId: t.id, status, ticketId: t.ticketId };
  });

  const practiceNext: string[] = [];
  for (const status of ["missed", "assisted"] as const) {
    for (const e of entries) {
      if (e.status === status && !practiceNext.includes(e.stepOrGuardrailId)) {
        practiceNext.push(e.stepOrGuardrailId);
      }
    }
  }
  return { sessionId: input.sessionId, workMapId: map.id, entries, practiceNext };
}
