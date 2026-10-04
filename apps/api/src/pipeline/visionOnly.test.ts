import { loadTickets } from "@shadow/guard/fixtures";
import { PublicTicket, type ServerMessage, type VisionResult } from "@shadow/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCuriosityEngine, recordIdIn } from "../curiosity/engine.js";
import type { LlmDeps } from "../llm/structured.js";
import { createMemoryObjectStorage } from "../storage/memory.js";
import { createMemoryStore } from "../store/memory.js";
import { buildWorkMap, type WorkMapDraft } from "../workmap/build.js";
import { createFrameProcessor } from "./frames.js";
import { outcomeFromText } from "./metrics.js";

const ticketsById = new Map(loadTickets().map((t) => [t.id, PublicTicket.parse(t)]));
const fakeLlm = { client: {}, model: "test" } as unknown as LlmDeps;
const log = { warn: vi.fn() };

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** What vision reads off each frame of an expert handling T3 — no DeskSim DOM involved. */
const SCRIPT: Record<string, VisionResult> = {
  f1: {
    events: [{ kind: "opened", object: "ticket T3", fact: "refund request for the annual plan" }],
    decisionCandidate: false,
    screenAnswers: ["tag chargeback-open is visible on T3"],
    unreadable: false,
  },
  f2: {
    events: [
      {
        kind: "action",
        object: "ticket T3",
        field: "status",
        to: "Committed: handoff billing disputes",
      },
    ],
    decisionCandidate: true,
    screenAnswers: [],
    unreadable: false,
  },
};

/** Wires frames -> curiosity exactly like app.ts does, with fakes for redaction and vision. */
function wire() {
  const session = createMemoryStore().createSession("capture");
  const sent: ServerMessage[] = [];
  const send = (m: ServerMessage) => sent.push(m);
  let sinkRef: ReturnType<typeof createFrameProcessor> | undefined;
  const curiosity = createCuriosityEngine({
    session,
    send,
    llm: null,
    ticketsById,
    screenAnswers: () => sinkRef?.screenAnswers() ?? [],
    log,
    phrase: async (gap) => `On ${gap.ticketId}, what is the ${gap.slot} behind it?`,
  });
  const sink = createFrameProcessor({
    session,
    send,
    llm: fakeLlm,
    redactImage: async (jpeg) => jpeg,
    storage: createMemoryObjectStorage(),
    log,
    extract: async (_llm, _prev, cur) =>
      SCRIPT[cur.frameId] ?? {
        events: [],
        decisionCandidate: false,
        screenAnswers: [],
        unreadable: false,
      },
    onDecision: (tMs) => curiosity.onVisionDecision(tMs),
    onVisionEvent: (event, tMs) => curiosity.onVisionEvent(event, tMs),
  });
  sinkRef = sink;
  const frame = (frameId: string, tMs: number) =>
    sink.onFrame({
      type: "frame",
      frameId,
      tMs,
      phash: "0".repeat(16),
      jpegBase64: Buffer.from(frameId).toString("base64"),
    });
  return { session, sent, sink, curiosity, frame };
}

describe("vision-only capture (no desk_event at all)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("yields a candidate question about the on-screen ticket", async () => {
    const { sent, sink, curiosity, frame } = wire();
    frame("f1", 2000);
    await flush();
    frame("f2", 9000);
    await flush();
    const qs = sent.flatMap((m) => (m.type === "candidate_question" ? [m.question] : []));
    expect(qs.length).toBeGreaterThan(0);
    expect(qs[0]).toMatchObject({ aboutTicketId: "T3", slot: "guardrail" });
    expect(qs[0]?.priority).toBeGreaterThanOrEqual(0.6);
    sink.stop();
    curiosity.stop();
  });

  it("builds a Work Map whose steps cite frame moments vision saw", async () => {
    const { session, sink, curiosity, frame } = wire();
    frame("f1", 2000);
    await flush();
    frame("f2", 9000);
    await flush();
    session.transcript.push({
      id: "seg_1",
      tStartMs: 8000,
      tEndMs: 11_000,
      speaker: "expert",
      text: "Never refund with an open chargeback, that goes to Billing disputes.",
      offRecord: false,
    });
    expect(session.events.every((e) => e.source === "vision")).toBe(true);
    let content = "";
    const generate = async (c: string): Promise<WorkMapDraft> => {
      content = c;
      // A builder can only cite frames it was given: take the frame of the vision action.
      const input = JSON.parse(c) as {
        events: { frameId: string; tMs: number; summary: string }[];
      };
      const action = input.events.find((e) => e.summary.startsWith("action"));
      if (!action) throw new Error("no vision action in the builder input");
      const moment = { tMs: action.tMs, frameId: action.frameId, clip: [4000, 14_000] };
      const quote = {
        text: "Never refund with an open chargeback",
        segmentId: "seg_1",
        tMs: 8000,
        speaker: "expert" as const,
        source: "live_question" as const,
      };
      return {
        id: "wm_x",
        version: 1,
        workflow: "Support triage",
        expertName: "Maya",
        language: "en",
        steps: [
          {
            id: "S1",
            order: 1,
            title: "Hand open chargebacks to Billing disputes",
            moment,
            decision: "handoff_billing_disputes",
            reason: quote,
            guardrailIds: [],
            judgmentCall: false,
          },
        ],
        guardrails: [],
        openQuestions: [],
        offRecordSpans: [],
        coverage: 0.5,
        teachBackConfirmedAtMs: null,
      };
    };
    const { map } = await buildWorkMap(fakeLlm, session, [], { generate });
    expect(content).not.toContain('"source":"dom"');
    expect(map.steps).toHaveLength(1);
    expect(map.steps[0]?.moment.frameId).toBe("f2");
    expect(session.storedFrameIds).toContain("f2");
    sink.stop();
    curiosity.stop();
  });
});

describe("vision text parsing", () => {
  it("finds known ticket ids first, else generic record references", () => {
    const known = ["T1", "T3", "T10"];
    expect(recordIdIn("ticket T10 · status", known)).toBe("T10");
    expect(recordIdIn("Ticket t3 opened", known)).toBe("T3");
    expect(recordIdIn("case #4512 escalated", known)).toBe("4512");
    expect(recordIdIn("INC-2041 resolved", known)).toBe("INC-2041");
    expect(recordIdIn("button hovered", known)).toBeNull();
  });

  it("reads the most specific outcome", () => {
    expect(outcomeFromText("Committed: handoff billing disputes")).toBe("handoff_billing_disputes");
    expect(outcomeFromText("hold the refund, hand off to security")).toBe("handoff_security");
    expect(outcomeFromText("Refund 49 EUR")).toBe("refund");
    expect(outcomeFromText("hovered the toolbar")).toBeNull();
  });
});
