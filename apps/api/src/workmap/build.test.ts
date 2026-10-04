import { describe, expect, it, vi } from "vitest";
import type { LlmDeps } from "../llm/structured.js";
import { createMemoryStore } from "../store/memory.js";
import { buildWorkMap, type WorkMapDraft } from "./build.js";

const llm = { client: {}, model: "test" } as unknown as LlmDeps;

function sessionWithEvidence() {
  const session = createMemoryStore().createSession("capture");
  session.transcript.push({
    id: "seg_1",
    tStartMs: 10_000,
    tEndMs: 14_000,
    speaker: "expert",
    text: "Never refund with an open chargeback, we'd pay twice.",
    offRecord: false,
  });
  session.storedFrameIds.push("f_1");
  return session;
}

function validDraft(): WorkMapDraft {
  const quote = {
    text: "Never refund with an open chargeback",
    segmentId: "seg_1",
    tMs: 12_000,
    speaker: "expert" as const,
    source: "live_question" as const,
  };
  const moment = { tMs: 11_000, frameId: "f_1", clip: [6000, 16_000] as [number, number] };
  return {
    id: "wm_model_invented",
    version: 1,
    workflow: "Support escalation triage",
    expertName: "Maya",
    language: "en",
    steps: [
      {
        id: "S1",
        order: 1,
        title: "Hold refunds on open chargebacks",
        moment,
        decision: "Held the refund, routed to Billing disputes",
        reason: quote,
        guardrailIds: ["G1"],
        judgmentCall: false,
      },
    ],
    guardrails: [
      {
        id: "G1",
        type: "never",
        condition: "open chargeback",
        action: "never refund",
        evidence: { quote, moment },
        machineRule: { when: { bodyMatchesAny: ["open chargeback"] }, effect: "BLOCK" },
      },
    ],
    openQuestions: [],
    offRecordSpans: [],
    coverage: 0.8,
    teachBackConfirmedAtMs: null,
  };
}

describe("buildWorkMap", () => {
  it("passes a valid draft through unchanged (no repair call)", async () => {
    const session = sessionWithEvidence();
    const generate = vi.fn(async () => validDraft());
    const { map, removed } = await buildWorkMap(llm, session, [], { generate });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(removed).toEqual([]);
    expect(map.steps).toHaveLength(1);
    expect(map.guardrails[0]?.machineRule).toBeDefined();
    expect(map.id).toBe(`wm_${session.id.replace(/^ses_/, "")}`);
  });

  it("repairs once; a still-fabricated quote is removed and becomes an open question", async () => {
    const session = sessionWithEvidence();
    const fabricated = validDraft();
    fabricated.guardrails = [];
    const base = validDraft().steps[0];
    if (!base) throw new Error("fixture missing step");
    fabricated.steps = [
      { ...base, guardrailIds: [] },
      {
        ...base,
        id: "S2",
        order: 2,
        title: "Always refund VIPs instantly",
        guardrailIds: [],
        reason: { ...base.reason, text: "VIPs always get instant refunds" },
      },
    ];
    const generate = vi.fn(async () => fabricated);
    const { map, removed } = await buildWorkMap(llm, session, [], { generate });
    expect(generate).toHaveBeenCalledTimes(2); // exactly one repair pass
    expect(map.steps.map((s) => s.id)).toEqual(["S1"]);
    expect(removed).toHaveLength(1);
    expect(removed[0]?.text).toContain("Always refund VIPs instantly");
    expect(map.openQuestions.some((q) => q.text.includes("Always refund VIPs instantly"))).toBe(
      true,
    );
  });

  it("an off-record citation is rejected", async () => {
    const session = sessionWithEvidence();
    session.offRecord.spans.push([9000, 15_000]); // the only evidence falls inside
    const generate = vi.fn(async () => validDraft());
    await expect(buildWorkMap(llm, session, [], { generate })).rejects.toThrow(
      /no evidenced steps/,
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("drops an unsupported machineRule but keeps the guardrail", async () => {
    const session = sessionWithEvidence();
    const draft = validDraft();
    const g0 = draft.guardrails[0];
    if (!g0) throw new Error("fixture missing guardrail");
    g0.machineRule = {
      when: { bodyMatchesAny: ["lawyer"] }, // not in the quote
      effect: "BLOCK",
    };
    const generate = vi.fn(async () => draft);
    const { map } = await buildWorkMap(llm, session, [], { generate });
    expect(map.guardrails).toHaveLength(1);
    expect(map.guardrails[0]?.machineRule).toBeUndefined();
    expect(map.steps[0]?.guardrailIds).toEqual(["G1"]); // reference survives
  });

  it("a removed guardrail is filtered out of step guardrailIds", async () => {
    const session = sessionWithEvidence();
    const draft = validDraft();
    const g = draft.guardrails[0];
    if (!g) throw new Error("fixture missing guardrail");
    g.evidence.quote = { ...g.evidence.quote, text: "totally invented rule" };
    const generate = vi.fn(async () => draft);
    const { map, removed } = await buildWorkMap(llm, session, [], { generate });
    expect(map.guardrails).toEqual([]);
    expect(map.steps[0]?.guardrailIds).toEqual([]);
    expect(removed.some((q) => q.slot === "guardrail")).toBe(true);
  });
});
