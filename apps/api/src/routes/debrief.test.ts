import { DebriefStatus, EndSessionResponse } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import type { LlmDeps } from "../llm/structured.js";
import { createMemoryStore } from "../store/memory.js";
import type { WorkMapDraft } from "../workmap/build.js";

const env = loadEnv({ NODE_ENV: "test" });
const fakeLlm = { client: {}, model: "test" } as unknown as LlmDeps;

function draft(coverage: number): WorkMapDraft {
  const quote = {
    text: "Never refund with an open chargeback",
    segmentId: "seg_1",
    tMs: 12_000,
    speaker: "expert" as const,
    source: "live_question" as const,
  };
  const moment = { tMs: 11_000, frameId: "f_1", clip: [6000, 16_000] };
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
        title: "Hold refunds on open chargebacks",
        moment,
        decision: "handoff_billing_disputes",
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
        machineRule: {
          when: { bodyMatchesAny: ["open chargeback"] },
          effect: "BLOCK",
          expectedOutcome: "handoff_billing_disputes",
        },
      },
    ],
    openQuestions: [],
    offRecordSpans: [],
    coverage,
    teachBackConfirmedAtMs: null,
  };
}

async function setup() {
  const store = createMemoryStore();
  // coverage grows as answers come in
  let calls = 0;
  const generate = vi.fn(async () => {
    calls += 1;
    return draft(calls === 1 ? 0.6 : 0.95);
  });
  const app = await buildApp({
    env,
    store,
    llm: fakeLlm,
    debriefSeams: {
      buildDeps: { generate },
      teachBackText: async (_map, instruction) =>
        instruction.includes("ONE short sentence")
          ? "Corrected: chargebacks go to Billing disputes."
          : "You triage by checking chargebacks first, then refund limits.",
    },
  });
  const created = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { mode: "capture" },
  });
  const sessionId = created.json<{ id: string }>().id;
  const session = store.getSession(sessionId);
  if (!session) throw new Error("session missing");
  // evidence the fake drafts cite + one observed outcome (so probes appear)
  session.transcript.push({
    id: "seg_1",
    tStartMs: 10_000,
    tEndMs: 14_000,
    speaker: "expert",
    text: "Never refund with an open chargeback, we'd pay twice.",
    offRecord: false,
  });
  session.storedFrameIds.push("f_1");
  session.events.push({
    id: "ev_1",
    tMs: 15_000,
    frameId: "dom",
    source: "dom",
    summary: "action",
    payload: {
      type: "action_committed",
      tMs: 15_000,
      ticketId: "T3",
      outcome: "handoff_billing_disputes",
    },
  });
  return { app, store, session, sessionId, generate };
}

describe("debrief endpoints", () => {
  it("end builds the map and returns probes for unseen outcomes, sorted by priority", async () => {
    const { app, store, sessionId } = await setup();
    const res = await app.inject({ method: "POST", url: `/sessions/${sessionId}/end` });
    expect(res.statusCode).toBe(200);
    const parsed = EndSessionResponse.parse(res.json());
    expect(parsed.workMapId).toBe(`wm_${sessionId.replace(/^ses_/, "")}`);
    expect(parsed.coverage).toBe(0.6);
    // no security/legal/engineering outcomes observed -> all three probes present
    expect(parsed.openQuestions.map((q) => q.id)).toContain("probe_security");
    const priorities = parsed.openQuestions.map((q) => q.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    expect(store.getWorkMap(parsed.workMapId)).toBeDefined();
  });

  it("debrief answers raise coverage and reach done once probes are answered", async () => {
    const { app, sessionId } = await setup();
    const end = await app.inject({ method: "POST", url: `/sessions/${sessionId}/end` });
    const open = EndSessionResponse.parse(end.json()).openQuestions;
    let last: DebriefStatus | undefined;
    for (const [i, q] of open.slice(0, 3).entries()) {
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/debrief/answer`,
        payload: { questionId: q.id, segmentIds: ["seg_1"] },
      });
      expect(res.statusCode).toBe(200);
      last = DebriefStatus.parse(res.json());
      expect(last.asked).toBe(i + 1);
    }
    expect(last?.coverage).toBe(0.95);
    expect(last?.done).toBe(true); // coverage >= 0.9, 3 asked, no >= 0.7 question left
  });

  it("answer without end -> 409; unknown question -> 404", async () => {
    const { app, sessionId } = await setup();
    const early = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/debrief/answer`,
      payload: { questionId: "q_x", segmentIds: ["seg_1"] },
    });
    expect(early.statusCode).toBe(409);
    await app.inject({ method: "POST", url: `/sessions/${sessionId}/end` });
    const unknown = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/debrief/answer`,
      payload: { questionId: "q_nope", segmentIds: ["seg_1"] },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("teach-back returns text; confirm stamps the map", async () => {
    const { app, store, sessionId } = await setup();
    await app.inject({ method: "POST", url: `/sessions/${sessionId}/end` });
    const tb = await app.inject({ method: "POST", url: `/sessions/${sessionId}/teachback` });
    expect(tb.statusCode).toBe(200);
    expect(tb.json<{ text: string }>().text).toContain("chargebacks");

    const confirm = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/teachback/confirm`,
      payload: { tMs: 90_000, confirmed: true },
    });
    expect(confirm.statusCode).toBe(200);
    const mapId = `wm_${sessionId.replace(/^ses_/, "")}`;
    expect(store.getWorkMap(mapId)?.teachBackConfirmedAtMs).toBe(90_000);
  });

  it("a correction rebuilds the map and returns a recheck sentence", async () => {
    const { app, sessionId, session } = await setup();
    await app.inject({ method: "POST", url: `/sessions/${sessionId}/end` });
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/teachback/confirm`,
      payload: { tMs: 95_000, confirmed: false, correctionSegmentIds: ["seg_1"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ recheckText?: string }>().recheckText).toContain("Corrected");
    expect(session.answeredQuestions.some((a) => a.question.includes("correction"))).toBe(true);
  });
});

describe("debrief failure paths", () => {
  it("a failed rebuild does not keep the answer, so a retry records it once", async () => {
    const { app, session, sessionId, generate } = await setup();
    const end = await app.inject({ method: "POST", url: `/sessions/${sessionId}/end` });
    const first = EndSessionResponse.parse(end.json()).openQuestions[0];
    if (!first) throw new Error("no open question");
    const before = session.answeredQuestions.length;
    // The draft call fails -> the rebuild throws -> 422.
    generate.mockRejectedValueOnce(new Error("workmap@1: max_tokens"));
    const payload = { questionId: first.id, segmentIds: ["seg_1"] };
    const url = `/sessions/${sessionId}/debrief/answer`;
    const failed = await app.inject({ method: "POST", url, payload });
    expect(failed.statusCode).toBe(422);
    expect(session.answeredQuestions).toHaveLength(before);

    const retried = await app.inject({ method: "POST", url, payload });
    expect(retried.statusCode).toBe(200);
    expect(DebriefStatus.parse(retried.json()).asked).toBe(1);
    expect(session.answeredQuestions).toHaveLength(before + 1);
  });

  it("a teach-back model failure is a 502 with an ApiError body", async () => {
    const store = createMemoryStore();
    const app = await buildApp({
      env,
      store,
      llm: fakeLlm,
      debriefSeams: {
        buildDeps: { generate: async () => draft(0.6) },
        teachBackText: async () => {
          throw new Error("teachback@1: refusal");
        },
      },
    });
    const { id } = (
      await app.inject({ method: "POST", url: "/sessions", payload: { mode: "capture" } })
    ).json<{ id: string }>();
    const session = store.getSession(id);
    if (!session) throw new Error("session missing");
    session.transcript.push({
      id: "seg_1",
      tStartMs: 10_000,
      tEndMs: 14_000,
      speaker: "expert",
      text: "Never refund with an open chargeback, we'd pay twice.",
      offRecord: false,
    });
    session.storedFrameIds.push("f_1");
    expect((await app.inject({ method: "POST", url: `/sessions/${id}/end` })).statusCode).toBe(200);
    const tb = await app.inject({ method: "POST", url: `/sessions/${id}/teachback` });
    expect(tb.statusCode).toBe(502);
    expect(tb.json()).toMatchObject({ code: "llm_failed" });
  });

  it("without a model key the debrief routes answer 503 llm_unavailable", async () => {
    const app = await buildApp({ env, llm: null });
    const { id } = (
      await app.inject({ method: "POST", url: "/sessions", payload: { mode: "capture" } })
    ).json<{ id: string }>();
    for (const [url, payload] of [
      [`/sessions/${id}/end`, undefined],
      [`/sessions/${id}/debrief/answer`, { questionId: "q", segmentIds: ["s"] }],
      [`/sessions/${id}/teachback`, undefined],
      [`/sessions/${id}/teachback/confirm`, { tMs: 0, confirmed: true }],
    ] as const) {
      const res = await app.inject({ method: "POST", url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, url).toBe(503);
      expect(res.json()).toMatchObject({ code: "llm_unavailable" });
    }
  });
});
