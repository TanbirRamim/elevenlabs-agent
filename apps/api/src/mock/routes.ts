import {
  DebriefAnswerRequest,
  DebriefStatus,
  type OpenQuestion,
  TeachBackConfirmRequest,
  TeachBackConfirmResponse,
  TeachBackResponse,
} from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/memory.js";
import type { MockFixtures } from "./fixtures.js";

/**
 * MOCK_AI=1 stand-ins for the debrief endpoints HAR-9 builds for real. They let the
 * web app run Capture -> Map -> Teach end to end with no Claude or Presidio keys.
 * The Work Map routes (routes/workmaps.ts), learner predictions and mastery (routes/teach.ts)
 * are the real store-backed ones; the fixture map is saved into the store here.
 */
export function registerMockRoutes(
  app: FastifyInstance,
  store: Store,
  fixtures: MockFixtures,
): void {
  const debriefs = new Map<string, { coverage: number; asked: number; open: OpenQuestion[] }>();
  const corrections = new Map<string, number>();
  store.saveWorkMap(fixtures.workMap);

  app.post<{ Params: { id: string } }>("/sessions/:id/end", async (req, reply) => {
    if (!store.getSession(req.params.id)) {
      return reply.code(404).send({ code: "unknown_session" });
    }
    // A fresh fixture map per debrief, so a previous teach-back confirmation never leaks.
    store.saveWorkMap(fixtures.workMap);
    corrections.delete(req.params.id);
    debriefs.set(req.params.id, {
      coverage: fixtures.endSession.coverage,
      asked: 0,
      open: [...fixtures.endSession.openQuestions],
    });
    return fixtures.endSession;
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/debrief/answer", async (req, reply) => {
    const body = DebriefAnswerRequest.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ code: "invalid_body" });
    }
    const state = debriefs.get(req.params.id);
    if (!state) {
      return reply.code(409).send({ code: "debrief_not_started" });
    }
    state.coverage = Math.min(1, state.coverage + 0.15);
    state.asked += 1;
    state.open = state.open.filter((q) => q.id !== body.data.questionId);
    // Mirrors HAR-9's done rule (coverage >= 0.9 AND asked >= 3); fixture coverage
    // 0.6 + 3 x 0.15 reaches done after exactly three answers.
    const done = state.coverage >= 0.9 && state.asked >= 3;
    return DebriefStatus.parse({
      coverage: state.coverage,
      openQuestions: done ? [] : state.open,
      asked: state.asked,
      done,
    });
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/teachback", async (req, reply) => {
    if (!debriefs.has(req.params.id)) {
      return reply.code(409).send({ code: "debrief_not_started" });
    }
    return TeachBackResponse.parse({ text: fixtures.teachBack.text });
  });

  app.post<{ Params: { id: string } }>("/sessions/:id/teachback/confirm", async (req, reply) => {
    const body = TeachBackConfirmRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ code: "invalid_body" });
    const map = store.getWorkMap(fixtures.endSession.workMapId);
    if (!debriefs.has(req.params.id) || !map) {
      return reply.code(409).send({ code: "debrief_not_started" });
    }
    if (body.data.confirmed) {
      const confirmed = { ...map, teachBackConfirmedAtMs: body.data.tMs };
      store.saveWorkMap(confirmed);
      return TeachBackConfirmResponse.parse({ workMap: confirmed });
    }
    if (body.data.correctionSegmentIds.length === 0) {
      return reply.code(400).send({ code: "correction_segments_required" });
    }
    const used = corrections.get(req.params.id) ?? 0;
    if (used >= 2) return reply.code(409).send({ code: "correction_limit" });
    corrections.set(req.params.id, used + 1);
    // Like the real route, a correction rebuilds the map, so it needs confirming again.
    const corrected = { ...map, version: map.version + 1, teachBackConfirmedAtMs: null };
    store.saveWorkMap(corrected);
    return TeachBackConfirmResponse.parse({
      workMap: corrected,
      recheckText: fixtures.teachBack.recheckText,
    });
  });
}
