import {
  DebriefAnswerRequest,
  DebriefStatus,
  MasteryReport,
  type OpenQuestion,
} from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/memory.js";
import type { MockFixtures } from "./fixtures.js";

/**
 * MOCK_AI=1 stand-ins for the endpoints HAR-9/HAR-12 build for real. They let the
 * web app run Capture -> Map -> Teach end to end with no Claude or Presidio keys.
 */
export function registerMockRoutes(
  app: FastifyInstance,
  store: Store,
  fixtures: MockFixtures,
): void {
  const debriefs = new Map<string, { coverage: number; asked: number; open: OpenQuestion[] }>();

  app.post<{ Params: { id: string } }>("/sessions/:id/end", async (req, reply) => {
    if (!store.getSession(req.params.id)) {
      return reply.code(404).send({ code: "unknown_session" });
    }
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

  // The id is pinned to end-session.json's workMapId by the fixture test; answering
  // any id keeps Tanbir unblocked rather than 404ing on a mismatch.
  app.get("/workmaps/:id", async () => fixtures.workMap);

  app.get<{ Params: { id: string } }>("/sessions/:id/mastery", async (req, reply) => {
    if (!store.getSession(req.params.id)) {
      return reply.code(404).send({ code: "unknown_session" });
    }
    return MasteryReport.parse({ ...fixtures.mastery, sessionId: req.params.id });
  });
}
