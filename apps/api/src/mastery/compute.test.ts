import { loadTickets } from "@shadow/guard/fixtures";
import type { GuardVerdict, Outcome } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { loadMockFixtures } from "../mock/fixtures.js";
import type { PredictionRecord, SessionRecord } from "../store/memory.js";
import { type Commit, computeMastery, resolvePrediction } from "./compute.js";

type VerdictRecord = SessionRecord["guardVerdicts"][number];

// The fixture map: G3/G6 carry machine rules, the fraud guardrail G4 is spoken only (judge).
const map = loadMockFixtures().workMap;
const tickets = new Map(loadTickets().map(({ label: _label, ...t }) => [t.id, t]));
const ticket = (id: string) => {
  const t = tickets.get(id);
  if (!t) throw new Error(`no seed ticket ${id}`);
  return t;
};
const guardrail = (id: string) => {
  const g = map.guardrails.find((x) => x.id === id);
  if (!g) throw new Error(`no guardrail ${id}`);
  return g;
};

let clock = 0;
const prediction = (ticketId: string, stepId: string, predicted: Outcome): PredictionRecord => {
  const r = resolvePrediction(map, ticket(ticketId), stepId);
  if (typeof r === "string") throw new Error(r);
  clock += 1;
  return {
    ticketId,
    stepId,
    guardrailId: r.guardrail?.id ?? null,
    predictedOutcome: predicted,
    expectedOutcome: r.expectedOutcome,
    correct: predicted === r.expectedOutcome,
    tMs: clock * 1000,
    at: clock,
  };
};
const verdict = (ticketId: string, outcome: Outcome, v: GuardVerdict): VerdictRecord => {
  clock += 1;
  return { ticketId, outcome, verdict: v, at: clock };
};
const run = (p: PredictionRecord[], v: VerdictRecord[], commits: Commit[]) =>
  computeMastery({ sessionId: "ses_t", map, predictions: p, verdicts: v, commits, tickets });
const statusByKey = (report: ReturnType<typeof run>) =>
  Object.fromEntries(report.entries.map((e) => [`${e.ticketId}:${e.stepOrGuardrailId}`, e.status]));

const N1_JUDGE_BLOCK: GuardVerdict = {
  decision: "BLOCK",
  ruleIds: ["G4", "G1"],
  expectedOutcome: "handoff_security",
  source: "llm_judge",
};

describe("resolvePrediction", () => {
  it("scores a step against the guardrail that fires on the ticket and quotes it (H7 -> G3)", () => {
    const r = resolvePrediction(map, ticket("H7"), "S4");
    if (typeof r === "string") throw new Error(r);
    expect(r.guardrail?.id).toBe("G3");
    expect(r.expectedOutcome).toBe("handoff_security");
    expect(r.reasonQuote).toBe(guardrail("G3").evidence.quote.text);
    expect(r.frameId).toBe(guardrail("G3").evidence.moment.frameId);
  });

  it("accepts a guardrail id when no step lists it (N2 -> G6)", () => {
    const r = resolvePrediction(map, ticket("N2"), "G6");
    if (typeof r === "string") throw new Error(r);
    expect(r.expectedOutcome).toBe("handoff_legal");
    expect(r.reasonQuote).toBe(guardrail("G6").evidence.quote.text);
  });

  it("reports unknown steps and steps with nothing to predict", () => {
    expect(resolvePrediction(map, ticket("N1"), "S99")).toBe("unknown_step");
    expect(resolvePrediction(map, ticket("T1"), "S1")).toBe("no_expected_outcome");
    // G4 has no machine rule, so there is no outcome to score a direct G4 prediction against.
    expect(resolvePrediction(map, ticket("N1"), "G4")).toBe("no_expected_outcome");
  });
});

describe("computeMastery", () => {
  it("scripted N1/N2 session (HAR-12 acceptance): N1 fraud assisted, N2 GDPR independent", () => {
    const report = run(
      [prediction("N2", "G6", "handoff_legal")], // right first time
      [
        verdict("N1", "refund", N1_JUDGE_BLOCK), // the judge catches the fraud refund
        verdict("N1", "handoff_security", {
          decision: "ALLOW",
          ruleIds: [],
          source: "machine_rule",
        }),
        verdict("N2", "handoff_legal", { decision: "ALLOW", ruleIds: [], source: "machine_rule" }),
      ],
      [
        { ticketId: "N1", outcome: "handoff_security" },
        { ticketId: "N2", outcome: "handoff_legal" },
      ],
    );
    expect(statusByKey(report)).toEqual({ "N1:G4": "assisted", "N2:G6": "independent" });
    expect(report.practiceNext).toEqual(["G4"]);
    expect(report.workMapId).toBe(map.id);
  });

  it("a right prediction followed by a BLOCKed save is assisted", () => {
    const report = run(
      [prediction("H7", "S4", "handoff_security")],
      [
        verdict("H7", "refund", {
          decision: "BLOCK",
          ruleIds: ["G3"],
          expectedOutcome: "handoff_security",
          source: "machine_rule",
        }),
      ],
      [{ ticketId: "H7", outcome: "handoff_security" }],
    );
    expect(statusByKey(report)).toEqual({ "H7:G3": "assisted" });
  });

  it("a wrong prediction then the right save is assisted", () => {
    const report = run(
      [prediction("H7", "S4", "refund")],
      [],
      [{ ticketId: "H7", outcome: "handoff_security" }],
    );
    expect(statusByKey(report)).toEqual({ "H7:G3": "assisted" });
  });

  it("missed: never right, or committed against a WARN; practiceNext puts missed first", () => {
    const report = run(
      [prediction("N2", "G6", "reply")],
      [
        verdict("N1", "refund", N1_JUDGE_BLOCK),
        verdict("H1", "refund", {
          decision: "WARN",
          ruleIds: ["G6"],
          expectedOutcome: "handoff_legal",
          source: "llm_judge",
        }),
      ],
      [
        { ticketId: "N1", outcome: "handoff_security" },
        { ticketId: "H1", outcome: "refund" },
      ],
    );
    expect(statusByKey(report)).toEqual({
      "N1:G4": "assisted",
      "N2:G6": "missed",
      "H1:G6": "missed",
    });
    expect(report.practiceNext).toEqual(["G6", "G4"]);
  });

  it("a correct save without a prediction counts as independent; a wrong one as missed", () => {
    const report = run(
      [],
      [],
      [
        { ticketId: "N2", outcome: "handoff_legal" },
        { ticketId: "H6", outcome: "refund" },
      ],
    );
    expect(report.entries).toEqual([
      { stepOrGuardrailId: "G6", status: "independent", ticketId: "N2" },
      { stepOrGuardrailId: "G2", status: "missed", ticketId: "H6" },
    ]);
  });

  it("an untouched session has no entries", () => {
    expect(run([], [], [])).toMatchObject({ entries: [], practiceNext: [] });
  });
});
