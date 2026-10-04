import { loadTickets } from "@shadow/guard/fixtures";
import {
  type DeskEvent,
  LearnerPredictionResult,
  MasteryReport,
  type Outcome,
} from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import type { LlmDeps } from "../llm/structured.js";
import { loadMockFixtures } from "../mock/fixtures.js";
import { createMemoryStore, type SessionRecord, type Store } from "../store/memory.js";

type App = Awaited<ReturnType<typeof buildApp>>;

const env = loadEnv({ NODE_ENV: "test" });
const fixtureMap = loadMockFixtures().workMap;
const fakeLlm = { client: {}, model: "test" } as unknown as LlmDeps;
const publicTicket = (id: string) => {
  const found = loadTickets().find((t) => t.id === id);
  if (!found) throw new Error(`no seed ticket ${id}`);
  const { label: _label, ...ticket } = found;
  return ticket;
};

/** What the session stream does with a desk event (routes/sessions.ts). */
function desk(session: SessionRecord, event: DeskEvent) {
  session.events.push({
    id: `ev_${session.events.length + 1}`,
    tMs: event.tMs,
    frameId: "dom",
    source: "dom",
    summary: event.type,
    payload: event as Record<string, unknown>,
  });
}

/**
 * Real mode with the fixture map published. The fixture's fraud guardrail G4 has no machine
 * rule, so the judge (a fake here) is what BLOCKs N1 + refund — as in a judged run.
 */
async function realApp(store: Store = createMemoryStore()) {
  store.publishWorkMap(fixtureMap);
  const decide = vi.fn(async () => ({
    decision: "BLOCK" as const,
    ruleIds: ["G4"],
    expectedOutcome: "handoff_security" as const,
  }));
  const app = await buildApp({
    env,
    store,
    storage: null,
    llm: fakeLlm,
    judgeSeams: { decide, log: { warn: vi.fn() } },
  });
  return { app, store };
}

async function teachSession(app: App, store: Store) {
  const res = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { mode: "teach", workMapId: fixtureMap.id },
  });
  const session = store.getSession(res.json<{ id: string }>().id);
  if (!session) throw new Error("session not stored");
  return session;
}

const predict = (
  app: App,
  sessionId: string,
  ticketId: string,
  stepId: string,
  predictedOutcome: Outcome,
) =>
  app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/predictions`,
    payload: { ticketId, stepId, predictedOutcome, tMs: 1000 },
  });

describe("POST /sessions/:id/predictions", () => {
  it("scores a wrong prediction with the applicable guardrail's quote and frame", async () => {
    const { app, store } = await realApp();
    const s = await teachSession(app, store);
    const res = await predict(app, s.id, "H7", "S4", "refund");
    expect(res.statusCode).toBe(200);
    const body = LearnerPredictionResult.parse(res.json());
    expect(body).toMatchObject({ correct: false, expectedOutcome: "handoff_security" });
    const g3 = fixtureMap.guardrails.find((g) => g.id === "G3");
    expect(body.reasonQuote).toBe(g3?.evidence.quote.text);
    expect(body.frameId).toBe(g3?.evidence.moment.frameId);
    expect(s.predictions).toMatchObject([{ ticketId: "H7", guardrailId: "G3", correct: false }]);
  });

  it("scores a correct prediction", async () => {
    const { app, store } = await realApp();
    const s = await teachSession(app, store);
    const res = await predict(app, s.id, "N2", "G6", "handoff_legal");
    expect(LearnerPredictionResult.parse(res.json())).toMatchObject({
      correct: true,
      expectedOutcome: "handoff_legal",
    });
  });

  it("rejects unknown sessions, tickets, steps and bad bodies", async () => {
    const { app, store } = await realApp();
    const s = await teachSession(app, store);
    expect((await predict(app, "ses_nope", "N1", "S4", "refund")).statusCode).toBe(404);
    expect((await predict(app, s.id, "Z9", "S4", "refund")).statusCode).toBe(404);
    expect((await predict(app, s.id, "N1", "S99", "refund")).json()).toMatchObject({
      code: "unknown_step",
    });
    expect((await predict(app, s.id, "T1", "S1", "reply")).statusCode).toBe(422);
    const bad = await app.inject({
      method: "POST",
      url: `/sessions/${s.id}/predictions`,
      payload: { ticketId: "N1" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("409s when no map is published", async () => {
    const app = await buildApp({ env, storage: null, llm: null });
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mode: "teach" },
    });
    const id = created.json<{ id: string }>().id;
    expect((await predict(app, id, "N1", "S4", "refund")).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: `/sessions/${id}/mastery` })).statusCode).toBe(
      409,
    );
  });
});

describe("GET /sessions/:id/mastery", () => {
  it("scripted N1/N2 session: N1 fraud assisted, N2 GDPR independent (HAR-12)", async () => {
    const { app, store } = await realApp();
    const s = await teachSession(app, store);

    desk(s, { type: "ticket_opened", tMs: 1000, ticketId: "N1" });
    const blocked = await app.inject({
      method: "POST",
      url: "/guard/presave",
      headers: { "x-shadow-session": s.id },
      payload: { ticket: publicTicket("N1"), outcome: "refund", amountEur: 180 },
    });
    expect(blocked.json()).toMatchObject({
      decision: "BLOCK",
      ruleIds: ["G4", "G1"],
      source: "llm_judge",
    });
    desk(s, { type: "action_committed", tMs: 9000, ticketId: "N1", outcome: "handoff_security" });

    desk(s, { type: "ticket_opened", tMs: 10_000, ticketId: "N2" });
    await predict(app, s.id, "N2", "G6", "handoff_legal");
    desk(s, { type: "action_committed", tMs: 14_000, ticketId: "N2", outcome: "handoff_legal" });

    const res = await app.inject({ method: "GET", url: `/sessions/${s.id}/mastery` });
    const report = MasteryReport.parse(res.json());
    expect(report.sessionId).toBe(s.id);
    expect(report.workMapId).toBe(fixtureMap.id);
    expect(report.entries).toEqual(
      expect.arrayContaining([
        { stepOrGuardrailId: "G4", status: "assisted", ticketId: "N1" },
        { stepOrGuardrailId: "G6", status: "independent", ticketId: "N2" },
      ]),
    );
    expect(report.entries).toHaveLength(2);
    expect(report.practiceNext).toEqual(["G4"]);
  });

  it("only counts presaves that name the session (header or ?sessionId=)", async () => {
    const { app, store } = await realApp();
    const s = await teachSession(app, store);
    const other = await teachSession(app, store);
    const payload = { ticket: publicTicket("N1"), outcome: "refund", amountEur: 180 };
    await app.inject({ method: "POST", url: "/guard/presave", payload });
    await app.inject({ method: "POST", url: `/guard/presave?sessionId=${s.id}`, payload });
    await app.inject({
      method: "POST",
      url: "/guard/presave",
      headers: { "x-shadow-session": "ses_unknown" },
      payload,
    });
    expect(s.guardVerdicts).toHaveLength(1);
    expect(other.guardVerdicts).toHaveLength(0);
  });

  it("404s an unknown session", async () => {
    const { app } = await realApp();
    expect((await app.inject({ method: "GET", url: "/sessions/ses_x/mastery" })).statusCode).toBe(
      404,
    );
  });
});
