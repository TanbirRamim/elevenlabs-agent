import { type PublicTicket, WorkMap } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import {
  buildIntervention,
  citedGuardrails,
  findMoment,
  masteryCounts,
  matchJudgment,
  momentForFrame,
  predictPayload,
  ticketMatchesRule,
} from "./logic";

const quote = (text: string, segmentId: string, tMs: number) => ({
  text,
  segmentId,
  tMs,
  speaker: "expert" as const,
  source: "debrief" as const,
});

const map = WorkMap.parse({
  id: "wm_test",
  version: 1,
  workflow: "Support triage",
  expertName: "Expert",
  steps: [
    {
      id: "S1",
      order: 1,
      title: "Refund duplicates",
      moment: { tMs: 1000, frameId: "f_1", clip: [0, 5000] },
      decision: "Refunded",
      reason: quote("Duplicate charge, I refund it.", "seg_1", 2000),
      guardrailIds: ["G1"],
      judgmentCall: false,
    },
    {
      id: "S2",
      order: 2,
      title: "Fraud goes to Security",
      moment: { tMs: 9000, frameId: "f_2", clip: [8000, 12000] },
      decision: "Handed to Security",
      reason: quote("Fraud is never refunded.", "seg_2", 9500),
      guardrailIds: ["G2"],
      judgmentCall: true,
    },
  ],
  guardrails: [
    {
      id: "G1",
      type: "limit",
      condition: "refund above 100 EUR",
      action: "needs approval",
      evidence: {
        quote: quote("Over a hundred needs a lead.", "seg_3", 3000),
        moment: { tMs: 1000, frameId: "f_1", clip: [0, 5000] },
      },
      machineRule: { when: { action: "refund", amountEurAbove: 100 }, effect: "REQUIRE_APPROVAL" },
    },
    {
      id: "G2",
      type: "stop_and_ask",
      condition: "card used without permission",
      action: "route to Security",
      evidence: {
        quote: quote("Never refund that, it goes to Security first.", "seg_4", 20000),
        moment: { tMs: 9000, frameId: "f_2", clip: [8000, 12000] },
      },
      machineRule: {
        when: { bodyMatchesAny: ["without my permission", "fraud"] },
        effect: "BLOCK",
        expectedOutcome: "handoff_security",
      },
    },
    {
      id: "G3",
      type: "never",
      condition: "chargeback open",
      action: "Billing disputes",
      evidence: {
        quote: quote("Never refund with a chargeback.", "seg_5", 30000),
        moment: { tMs: 30000, frameId: "f_3", clip: [28000, 32000] },
      },
      machineRule: {
        when: { anyTag: ["chargeback-open"] },
        effect: "BLOCK",
        expectedOutcome: "handoff_billing_disputes",
      },
    },
  ],
  openQuestions: [],
  offRecordSpans: [],
  coverage: 0.9,
  teachBackConfirmedAtMs: null,
});

const ticket = (over: Partial<PublicTicket>): PublicTicket => ({
  id: "X1",
  subject: "Refund",
  body: "Please refund me.",
  customer: { name: "A", email: "a@example.com", plan: "monthly", vip: false, accountAgeDays: 10 },
  tags: ["billing"],
  amountEur: 180,
  ...over,
});

const fraud = ticket({ id: "X1", body: "Refund 180. My card was used WITHOUT MY PERMISSION." });

describe("citedGuardrails", () => {
  it("returns the map's guardrails in verdict order and reports unknown ids", () => {
    const r = citedGuardrails(map, ["G2", "G9", "G1", "G2"]);
    expect(r.found.map((g) => g.id)).toEqual(["G2", "G1"]);
    expect(r.missing).toEqual(["G9"]);
  });

  it("reports every id as missing without a map", () => {
    expect(citedGuardrails(null, ["G2"])).toEqual({ found: [], missing: ["G2"] });
  });
});

describe("buildIntervention", () => {
  it("carries the expert's quote, frame and expected outcome of the first cited rule", () => {
    const i = buildIntervention(
      map,
      { decision: "BLOCK", ruleIds: ["G2", "G1"], source: "machine_rule" },
      "X1",
      "refund",
    );
    expect(i.payload).toEqual({
      ticketId: "X1",
      attemptedOutcome: "refund",
      ruleIds: ["G2", "G1"],
      quote: "Never refund that, it goes to Security first.",
      frameId: "f_2",
      expectedOutcome: "handoff_security",
      condition: "card used without permission",
      stepId: "S2",
    });
    expect(i.moment?.clip).toEqual([8000, 12000]);
  });

  it("prefers the verdict's expected outcome and degrades to nulls for unknown rules", () => {
    const i = buildIntervention(
      map,
      {
        decision: "BLOCK",
        ruleIds: ["G4"],
        expectedOutcome: "handoff_legal",
        source: "llm_judge",
      },
      "X2",
      "reply",
    );
    expect(i.payload.quote).toBeNull();
    expect(i.payload.frameId).toBeNull();
    expect(i.payload.expectedOutcome).toBe("handoff_legal");
    expect(i.cited.missing).toEqual(["G4"]);
    expect(i.moment).toBeNull();
  });

  it("never quotes a lesser rule when the deciding rule is missing from the map", () => {
    const i = buildIntervention(
      map,
      {
        decision: "BLOCK",
        ruleIds: ["G4", "G1"],
        expectedOutcome: "handoff_security",
        source: "machine_rule",
      },
      "X1",
      "refund",
    );
    expect(i.primary).toBeNull();
    expect(i.payload.quote).toBeNull();
    expect(i.payload.frameId).toBeNull();
    expect(i.cited.found.map((g) => g.id)).toEqual(["G1"]);
    expect(i.cited.missing).toEqual(["G4"]);
  });
});

describe("matchJudgment", () => {
  it("matches body phrases case-insensitively and links the judgment step", () => {
    const m = matchJudgment(map, fraud);
    expect(m?.guardrail.id).toBe("G2");
    expect(m?.step?.id).toBe("S2");
    expect(m?.expectedOutcome).toBe("handoff_security");
    expect(m && predictPayload(m, fraud.id)).toEqual({
      stepId: "S2",
      ticketId: "X1",
      guardrailId: "G2",
      condition: "card used without permission",
    });
  });

  it("matches tags and falls back to the guardrail id when no step lists it", () => {
    const m = matchJudgment(map, ticket({ tags: ["billing", "chargeback-open"] }));
    expect(m?.guardrail.id).toBe("G3");
    expect(m?.step).toBeUndefined();
    expect(m?.predictId).toBe("G3");
  });

  it("ignores action-only rules and tickets that match nothing", () => {
    expect(
      ticketMatchesRule(map.guardrails[0]?.machineRule ?? { when: {}, effect: "WARN" }, fraud),
    ).toBe(false);
    expect(matchJudgment(map, ticket({ body: "Charged twice, refund one." }))).toBeNull();
  });

  it("respects amount and VIP conditions on content rules", () => {
    const rule = {
      when: { anyTag: ["billing"], amountEurAbove: 200, vip: true },
      effect: "WARN" as const,
    };
    expect(ticketMatchesRule(rule, ticket({ amountEur: 250 }))).toBe(false);
    expect(
      ticketMatchesRule(
        rule,
        ticket({
          amountEur: 250,
          customer: { name: "A", email: "a@x.io", plan: "annual", vip: true, accountAgeDays: 1 },
        }),
      ),
    ).toBe(true);
  });
});

describe("findMoment", () => {
  it("resolves a frame id to a guardrail's evidence, then to a step", () => {
    expect(findMoment(map, "f_3")?.quote).toBe("Never refund with a chargeback.");
    expect(findMoment(map, "f_2")?.title).toBe("card used without permission");
    expect(findMoment(map, "nope")).toBeNull();
    expect(findMoment(null, "f_1")).toBeNull();
  });
});

describe("momentForFrame", () => {
  it("prefers the guardrail being taught when two guardrails share a frame", () => {
    const g = map.guardrails[0];
    if (!g) throw new Error("test map has no guardrail");
    const twin = { ...g, id: "GX", condition: "a different rule on the same frame" };
    const shared = { ...map, guardrails: [twin, ...map.guardrails] };
    const frame = g.evidence.moment.frameId;
    expect(findMoment(shared, frame)?.title).toBe("a different rule on the same frame");
    expect(momentForFrame(shared, frame, g)?.title).toBe(g.condition);
    expect(momentForFrame(shared, "nope", g)).toBeNull();
  });
});

describe("masteryCounts", () => {
  it("counts entries per status", () => {
    expect(
      masteryCounts([{ status: "assisted" }, { status: "missed" }, { status: "assisted" }]),
    ).toEqual({ independent: 0, assisted: 2, missed: 1 });
  });
});
