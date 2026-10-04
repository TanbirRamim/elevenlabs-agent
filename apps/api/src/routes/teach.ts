import {
  DeskEvent,
  LearnerPrediction,
  LearnerPredictionResult,
  MasteryReport,
  type Ticket,
  type WorkMap,
} from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { type Commit, computeMastery, resolvePrediction } from "../mastery/compute.js";
import type { SessionRecord, Store } from "../store/memory.js";

export interface TeachRouteDeps {
  tickets: readonly Ticket[];
  /**
   * MOCK_AI only: the fixture map scored against while nothing is published, the same map
   * GET /workmaps/published serves then.
   */
  publishedFallback?: WorkMap;
}

/**
 * The map a teach session is scored against: the one it was opened with (draft or published),
 * else the published map (or the fixture fallback). Undefined: nothing to score against.
 */
function mapFor(store: Store, session: SessionRecord, fallback?: WorkMap): WorkMap | undefined {
  const published = store.getPublishedWorkMap() ?? fallback;
  const id = session.workMapId;
  if (id === undefined) return published;
  return store.getWorkMap(id) ?? (published?.id === id ? published : undefined);
}

function commitsOf(session: SessionRecord): Commit[] {
  return session.events.flatMap((e) => {
    const ev = DeskEvent.safeParse(e.payload);
    return ev.success && ev.data.type === "action_committed"
      ? [{ ticketId: ev.data.ticketId, outcome: ev.data.outcome }]
      : [];
  });
}

/**
 * HAR-12: learner predictions and the mastery report for teach sessions. No Claude calls:
 * predictions are scored against the map, mastery from the session's guard verdicts
 * (recorded by /guard/presave), predictions and committed desk actions.
 */
export function registerTeachRoutes(
  app: FastifyInstance,
  store: Store,
  { tickets, publishedFallback }: TeachRouteDeps,
): void {
  const ticketsById = new Map(tickets.map(({ label: _label, ...t }) => [t.id, t]));

  app.post<{ Params: { id: string } }>("/sessions/:id/predictions", async (req, reply) => {
    const session = store.getSession(req.params.id);
    if (!session) return reply.code(404).send({ code: "unknown_session" });
    const body = LearnerPrediction.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ code: "invalid_body", issues: body.error.issues });
    }
    const map = mapFor(store, session, publishedFallback);
    if (!map) {
      return reply.code(409).send({ code: "no_workmap", message: "no map to score against" });
    }
    const ticket = ticketsById.get(body.data.ticketId);
    if (!ticket) return reply.code(404).send({ code: "unknown_ticket" });

    const resolved = resolvePrediction(map, ticket, body.data.stepId);
    if (typeof resolved === "string") {
      return reply.code(resolved === "unknown_step" ? 404 : 422).send({ code: resolved });
    }
    const correct = body.data.predictedOutcome === resolved.expectedOutcome;
    session.predictions.push({
      ticketId: ticket.id,
      stepId: body.data.stepId,
      guardrailId: resolved.guardrail?.id ?? null,
      predictedOutcome: body.data.predictedOutcome,
      expectedOutcome: resolved.expectedOutcome,
      correct,
      tMs: body.data.tMs,
      at: Date.now(),
    });
    req.log.info(
      { sessionId: session.id, ticket: ticket.id, stepId: body.data.stepId, correct },
      "prediction",
    );
    return LearnerPredictionResult.parse({
      correct,
      expectedOutcome: resolved.expectedOutcome,
      reasonQuote: resolved.reasonQuote,
      frameId: resolved.frameId,
    });
  });

  app.get<{ Params: { id: string } }>("/sessions/:id/mastery", async (req, reply) => {
    const session = store.getSession(req.params.id);
    if (!session) return reply.code(404).send({ code: "unknown_session" });
    const map = mapFor(store, session, publishedFallback);
    if (!map) {
      return reply.code(409).send({ code: "no_workmap", message: "no map to score against" });
    }
    return MasteryReport.parse(
      computeMastery({
        sessionId: session.id,
        map,
        predictions: session.predictions,
        verdicts: [...session.guardVerdicts].sort((a, b) => a.at - b.at),
        commits: commitsOf(session),
        tickets: ticketsById,
      }),
    );
  });
}
