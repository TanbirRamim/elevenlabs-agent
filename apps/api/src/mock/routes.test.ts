import {
  EndSessionResponse,
  MasteryReport,
  PredictionVariants,
  ServerMessage,
  TeachBackConfirmResponse,
  TeachBackResponse,
  WorkMap,
} from "@shadow/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import { loadMockFixtures } from "./fixtures.js";
import { createMockStreamHooks } from "./stream.js";

const mockEnv = loadEnv({ NODE_ENV: "test", MOCK_AI: "1" });

async function createSession(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { mode: "capture" },
  });
  return res.json<{ id: string }>().id;
}

describe("mock routes (MOCK_AI=1)", () => {
  it("runs end -> three debrief answers -> done", async () => {
    const app = await buildApp({ env: mockEnv });
    const id = await createSession(app);

    const end = await app.inject({ method: "POST", url: `/sessions/${id}/end` });
    expect(end.statusCode).toBe(200);
    const endParsed = EndSessionResponse.parse(end.json());
    expect(endParsed.openQuestions.length).toBe(3);

    let last: { coverage: number; done: boolean } | undefined;
    for (const q of endParsed.openQuestions) {
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${id}/debrief/answer`,
        payload: { questionId: q.id, segmentIds: ["seg_1"] },
      });
      expect(res.statusCode).toBe(200);
      last = res.json();
    }
    expect(last?.done).toBe(true);
    expect(last?.coverage).toBeGreaterThanOrEqual(0.9);
  });

  it("serves the workmap and mastery fixtures", async () => {
    const app = await buildApp({ env: mockEnv });
    const id = await createSession(app);

    const map = await app.inject({ method: "GET", url: "/workmaps/wm_mock_1" });
    expect(WorkMap.safeParse(map.json()).success).toBe(true);

    const mastery = await app.inject({ method: "GET", url: `/sessions/${id}/mastery` });
    const parsed = MasteryReport.parse(mastery.json());
    expect(parsed.sessionId).toBe(id);
  });

  it("404s session endpoints for unknown sessions", async () => {
    const app = await buildApp({ env: mockEnv });
    const res = await app.inject({ method: "POST", url: "/sessions/ses_nope/end" });
    expect(res.statusCode).toBe(404);
  });

  it("does not register mock routes when MOCK_AI=0", async () => {
    const app = await buildApp({ env: loadEnv({ NODE_ENV: "test", MOCK_AI: "0" }) });
    const id = await createSession(app);
    // The real debrief route answers instead of the fixture: without a key, unavailable.
    const res = await app.inject({ method: "POST", url: `/sessions/${id}/end` });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: "llm_unavailable" });
    expect((await app.inject({ method: "GET", url: "/workmaps/published" })).statusCode).toBe(404);
  });

  it("serves teach-back, a correction, confirmation and predictions", async () => {
    const app = await buildApp({ env: mockEnv });
    const id = await createSession(app);
    expect(
      (await app.inject({ method: "POST", url: `/sessions/${id}/teachback` })).statusCode,
    ).toBe(409);
    const end = EndSessionResponse.parse(
      (await app.inject({ method: "POST", url: `/sessions/${id}/end` })).json(),
    );
    const tb = await app.inject({ method: "POST", url: `/sessions/${id}/teachback` });
    expect(TeachBackResponse.parse(tb.json()).text.length).toBeGreaterThan(0);

    const url = `/sessions/${id}/teachback/confirm`;
    const corr = await app.inject({
      method: "POST",
      url,
      payload: { tMs: 500_000, confirmed: false, correctionSegmentIds: ["seg_9"] },
    });
    const corrected = TeachBackConfirmResponse.parse(corr.json());
    expect(corrected.recheckText).toBeDefined();
    expect(corrected.workMap.teachBackConfirmedAtMs).toBeNull();
    const empty = await app.inject({ method: "POST", url, payload: { tMs: 1, confirmed: false } });
    expect(empty.statusCode).toBe(400);

    const ok = await app.inject({
      method: "POST",
      url,
      payload: { tMs: 520_000, confirmed: true },
    });
    expect(TeachBackConfirmResponse.parse(ok.json()).workMap.teachBackConfirmedAtMs).toBe(520_000);
    const stored = await app.inject({ method: "GET", url: `/workmaps/${end.workMapId}` });
    expect(WorkMap.parse(stored.json()).teachBackConfirmedAtMs).toBe(520_000);

    const pred = await app.inject({
      method: "POST",
      url: `/workmaps/${end.workMapId}/predictions`,
    });
    const { variants } = PredictionVariants.parse(pred.json());
    expect(variants).toHaveLength(2);
    const stepIds = new Set(WorkMap.parse(stored.json()).steps.map((s) => s.id));
    for (const v of variants) expect(stepIds.has(v.becauseStepId)).toBe(true);
  });

  it("serves the fixture map as published, its markdown, publish and patch", async () => {
    const app = await buildApp({ env: mockEnv });
    const published = await app.inject({ method: "GET", url: "/workmaps/published" });
    expect(WorkMap.parse(published.json()).id).toBe("wm_mock_1");
    const md = await app.inject({ method: "GET", url: "/workmaps/wm_mock_1/markdown" });
    expect(md.statusCode).toBe(200);
    expect(md.headers["content-type"]).toContain("text/markdown");
    for (const g of WorkMap.parse(published.json()).guardrails) {
      expect(md.body).toContain(g.evidence.quote.text);
    }
    const pub = await app.inject({ method: "POST", url: "/workmaps/wm_mock_1/publish" });
    expect(pub.json()).toEqual({ id: "wm_mock_1" });
    const patched = await app.inject({
      method: "PATCH",
      url: "/workmaps/wm_mock_1",
      payload: { deleteGuardrailIds: ["G6"] },
    });
    expect(WorkMap.parse(patched.json()).guardrails.some((g) => g.id === "G6")).toBe(false);
  });
});

describe("mock stream hook", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the ticket's candidate question 3 s after action_committed", () => {
    const hooks = createMockStreamHooks(loadMockFixtures());
    const send = vi.fn();
    const timers = new Set<NodeJS.Timeout>();

    hooks.onDeskEvent(
      {
        type: "action_committed",
        tMs: 10_000,
        ticketId: "T3",
        outcome: "handoff_billing_disputes",
      },
      send,
      timers,
    );
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(send).toHaveBeenCalledTimes(1);
    const message = ServerMessage.parse(send.mock.calls[0]?.[0]);
    if (message.type !== "candidate_question") throw new Error("expected candidate_question");
    expect(message.question.aboutTicketId).toBe("T3");
    expect(message.question.createdAtMs).toBe(13_000);
    expect(timers.size).toBe(0);
  });

  it("a cleared timer set (socket close) sends nothing", () => {
    const hooks = createMockStreamHooks(loadMockFixtures());
    const send = vi.fn();
    const timers = new Set<NodeJS.Timeout>();

    hooks.onDeskEvent(
      { type: "action_committed", tMs: 0, ticketId: "T4", outcome: "handoff_security" },
      send,
      timers,
    );
    for (const timer of timers) clearTimeout(timer);
    timers.clear();

    vi.advanceTimersByTime(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores events without a fixture question", () => {
    const hooks = createMockStreamHooks(loadMockFixtures());
    const send = vi.fn();
    const timers = new Set<NodeJS.Timeout>();
    hooks.onDeskEvent({ type: "input_activity", tMs: 0 }, send, timers);
    hooks.onDeskEvent(
      { type: "action_committed", tMs: 0, ticketId: "H1", outcome: "close" },
      send,
      timers,
    );
    vi.advanceTimersByTime(10_000);
    expect(send).not.toHaveBeenCalled();
  });
});
