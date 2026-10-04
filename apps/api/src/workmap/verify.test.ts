import type { Guardrail, Step, TranscriptSegment } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { type EvidenceContext, verifyEvidence } from "./verify.js";

const segments: TranscriptSegment[] = [
  {
    id: "seg_1",
    tStartMs: 10_000,
    tEndMs: 14_000,
    speaker: "expert",
    text: "Never refund with an open chargeback,   we'd pay twice.",
    offRecord: false,
  },
  {
    id: "seg_agent",
    tStartMs: 16_000,
    tEndMs: 17_000,
    speaker: "agent",
    text: "Understood, chargebacks go to billing disputes.",
    offRecord: false,
  },
  {
    id: "seg_secret",
    tStartMs: 70_000,
    tEndMs: 74_000,
    speaker: "expert",
    text: "off the record, we sometimes just eat the loss",
    offRecord: false,
  },
];

const ctx: EvidenceContext = {
  transcript: segments,
  storedFrameIds: ["f_1", "f_2"],
  offRecordSpans: [[65_000, 80_000]],
};

const quote = (over: Partial<Step["reason"]> = {}): Step["reason"] => ({
  text: "never refund with an open chargeback",
  segmentId: "seg_1",
  tMs: 12_000,
  speaker: "expert",
  source: "live_question",
  ...over,
});

const step = (over: Partial<Step> = {}): Step => ({
  id: "S1",
  order: 1,
  title: "Hold refunds on open chargebacks",
  moment: { tMs: 11_000, frameId: "f_1", clip: [6000, 16_000] },
  decision: "Held the refund",
  reason: quote(),
  guardrailIds: [],
  judgmentCall: false,
  ...over,
});

const guardrail = (over: Partial<Guardrail> = {}): Guardrail => ({
  id: "G1",
  type: "never",
  condition: "open chargeback",
  action: "never refund",
  evidence: { quote: quote(), moment: { tMs: 11_000, frameId: "f_2", clip: [6000, 16_000] } },
  ...over,
});

describe("verifyEvidence (§6.6)", () => {
  it("passes a valid map unchanged (case and whitespace normalized)", () => {
    expect(verifyEvidence({ steps: [step()], guardrails: [guardrail()] }, ctx)).toEqual([]);
  });

  it("flags a fabricated quote", () => {
    const bad = step({ reason: quote({ text: "we always refund immediately" }) });
    const violations = verifyEvidence({ steps: [bad], guardrails: [] }, ctx);
    expect(violations).toMatchObject([{ kind: "quote_not_verbatim", stepId: "S1" }]);
  });

  it("flags quotes from non-expert speakers and unknown segments", () => {
    const agentQuote = step({
      reason: quote({ segmentId: "seg_agent", text: "chargebacks go to billing disputes" }),
    });
    const ghost = step({ id: "S2", reason: quote({ segmentId: "seg_ghost" }) });
    const violations = verifyEvidence({ steps: [agentQuote, ghost], guardrails: [] }, ctx);
    expect(violations.map((v) => v.kind)).toEqual(["quote_not_expert", "unknown_segment"]);
  });

  it("rejects citations inside off-the-record spans", () => {
    const offRecord = step({
      reason: quote({
        segmentId: "seg_secret",
        text: "we sometimes just eat the loss",
        tMs: 72_000,
      }),
      moment: { tMs: 71_000, frameId: "f_1", clip: [66_000, 76_000] },
    });
    const violations = verifyEvidence({ steps: [offRecord], guardrails: [] }, ctx);
    expect(violations.filter((v) => v.kind === "off_record").length).toBe(2); // quote + moment
  });

  it("flags unknown frames", () => {
    const bad = step({ moment: { tMs: 11_000, frameId: "f_ghost", clip: [6000, 16_000] } });
    expect(verifyEvidence({ steps: [bad], guardrails: [] }, ctx)).toMatchObject([
      { kind: "unknown_frame", stepId: "S1" },
    ]);
  });

  it("flags machineRule phrases that are not in the cited quote", () => {
    const g = guardrail({
      machineRule: {
        when: { bodyMatchesAny: ["open chargeback", "lawyer"] },
        effect: "BLOCK",
      },
    });
    const violations = verifyEvidence({ steps: [step()], guardrails: [g] }, ctx);
    expect(violations).toMatchObject([
      {
        kind: "machine_rule_unsupported",
        guardrailId: "G1",
        detail: expect.stringContaining("lawyer"),
      },
    ]);
  });
});
