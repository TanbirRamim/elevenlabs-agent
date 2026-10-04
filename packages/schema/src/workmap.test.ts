import { describe, expect, it } from "vitest";
import { WorkMap } from "./workmap.js";

const quote = (tMs: number) => ({
  text: "Never refund with an open chargeback, we'd pay twice.",
  segmentId: "seg_1",
  tMs,
  speaker: "expert" as const,
  source: "live_question" as const,
});
const moment = (tMs: number) => ({
  tMs,
  frameId: "f_1",
  clip: [tMs - 5000, tMs + 5000] as [number, number],
});

const base = {
  id: "wm_1",
  version: 1,
  workflow: "Support escalation triage",
  expertName: "Maya",
  steps: [
    {
      id: "S1",
      order: 1,
      title: "Check disputes before refunding",
      moment: moment(190_000),
      decision: "Held refund, routed to Billing disputes",
      reason: quote(195_000),
      guardrailIds: ["G2"],
      judgmentCall: true,
    },
  ],
  guardrails: [
    {
      id: "G2",
      type: "never" as const,
      condition: "open chargeback",
      action: "never refund",
      evidence: { quote: quote(195_000), moment: moment(190_000) },
    },
  ],
  openQuestions: [],
  offRecordSpans: [] as [number, number][],
  coverage: 1,
  teachBackConfirmedAtMs: null,
};

describe("WorkMap evidence rules", () => {
  it("accepts a map whose every step and guardrail carries evidence", () => {
    expect(WorkMap.safeParse(base).success).toBe(true);
  });

  it("rejects a step without a quote (no evidence, no step)", () => {
    const { reason: _r, ...stepWithoutReason } = base.steps[0] ?? {};
    expect(WorkMap.safeParse({ ...base, steps: [stepWithoutReason] }).success).toBe(false);
  });

  it("rejects references to guardrails that do not exist", () => {
    const steps = [{ ...base.steps[0], guardrailIds: ["G99"] }];
    expect(WorkMap.safeParse({ ...base, steps }).success).toBe(false);
  });

  it("rejects steps that cite off-the-record time", () => {
    expect(WorkMap.safeParse({ ...base, offRecordSpans: [[180_000, 200_000]] }).success).toBe(
      false,
    );
  });

  it("keeps sourceSessionId optional and backward compatible", () => {
    const legacy = WorkMap.parse(base);
    expect(legacy.sourceSessionId).toBeUndefined();
    const linked = WorkMap.parse({ ...base, sourceSessionId: "ses_1234" });
    expect(linked.sourceSessionId).toBe("ses_1234");
    expect(WorkMap.safeParse({ ...base, sourceSessionId: "" }).success).toBe(false);
  });
});
