import { teachBack } from "@shadow/prompts";
import {
  DebriefAnswerRequest,
  DebriefStatus,
  EndSessionResponse,
  type OpenQuestion,
  type Outcome,
  TeachBackConfirmRequest,
  TeachBackConfirmResponse,
  TeachBackResponse,
  type WorkMap,
} from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { unseenCaseProbes } from "../curiosity/probes.js";
import { CLAUDE_ROUTE_RATE_LIMIT } from "../limits.js";
import { type LlmDeps, structured } from "../llm/structured.js";
import type { SessionRecord, Store } from "../store/memory.js";
import { type BuildDeps, buildWorkMap } from "../workmap/build.js";

const TeachBackText = z.object({ text: z.string() });
const MAX_ASKED = 8;

export interface DebriefDeps {
  llm: LlmDeps;
  /** Test seams. */
  buildDeps?: BuildDeps;
  teachBackText?: (map: WorkMap, instruction: string) => Promise<string>;
}

function observedOutcomes(session: SessionRecord): Outcome[] {
  return session.events.flatMap((e) => {
    const p = e.payload as { type?: string; outcome?: Outcome };
    return e.source === "dom" && p.type === "action_committed" && p.outcome ? [p.outcome] : [];
  });
}

function mergeOpenQuestions(map: WorkMap, session: SessionRecord): OpenQuestion[] {
  const all = [
    ...map.openQuestions,
    ...session.debriefQueue,
    ...unseenCaseProbes(observedOutcomes(session)),
  ];
  const seen = new Set<string>();
  const answeredTexts = new Set(session.answeredQuestions.map((a) => a.question));
  return all
    .filter((q) => {
      if (seen.has(q.id) || answeredTexts.has(q.text)) return false;
      seen.add(q.id);
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
}

function doneRule(coverage: number, open: OpenQuestion[], asked: number): boolean {
  if (asked >= MAX_ASKED) return true;
  return coverage >= 0.9 && !open.some((q) => q.priority >= 0.7) && asked >= 3;
}

/**
 * Without ANTHROPIC_API_KEY the debrief cannot run: answer every debrief route with
 * 503 llm_unavailable instead of a 404 that reads as "this API has no such route".
 */
export function registerDebriefUnavailableRoutes(app: FastifyInstance): void {
  for (const path of [
    "/sessions/:id/end",
    "/sessions/:id/debrief/answer",
    "/sessions/:id/teachback",
    "/sessions/:id/teachback/confirm",
  ]) {
    app.post(path, async (_req, reply) =>
      reply
        .code(503)
        .send({ code: "llm_unavailable", message: "ANTHROPIC_API_KEY is not configured" }),
    );
  }
}

/** POST /sessions/:id/end, debrief/answer, teachback(+confirm). All call Claude. */
export function registerDebriefRoutes(
  app: FastifyInstance,
  store: Store,
  { llm, buildDeps, teachBackText }: DebriefDeps,
): void {
  const asked = new Map<string, number>();
  const teachText =
    teachBackText ??
    (async (map: WorkMap, instruction: string) => {
      const out = await structured(llm, teachBack, TeachBackText, [
        { type: "text", text: `${instruction}\n\nWork Map:\n${JSON.stringify(map)}` },
      ]);
      return out.text;
    });

  const rebuild = async (
    session: SessionRecord,
  ): Promise<{ map: WorkMap; open: OpenQuestion[] }> => {
    const { map } = await buildWorkMap(llm, session, session.answeredQuestions, buildDeps ?? {});
    const open = mergeOpenQuestions(map, session);
    const withOpen = { ...map, openQuestions: open };
    store.saveWorkMap(withOpen);
    return { map: withOpen, open };
  };

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/end",
    { config: CLAUDE_ROUTE_RATE_LIMIT },
    async (req, reply) => {
      const session = store.getSession(req.params.id);
      if (!session) return reply.code(404).send({ code: "unknown_session" });
      try {
        const { map, open } = await rebuild(session);
        asked.set(session.id, 0);
        return EndSessionResponse.parse({
          workMapId: map.id,
          coverage: map.coverage,
          openQuestions: open,
        });
      } catch (err) {
        req.log.warn({ sessionId: session.id, err: String(err) }, "map build failed");
        return reply.code(422).send({ code: "map_unbuildable" });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/debrief/answer",
    { config: CLAUDE_ROUTE_RATE_LIMIT },
    async (req, reply) => {
      const body = DebriefAnswerRequest.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ code: "invalid_body" });
      const session = store.getSession(req.params.id);
      if (!session) return reply.code(404).send({ code: "unknown_session" });
      const askedSoFar = asked.get(session.id);
      if (askedSoFar === undefined) return reply.code(409).send({ code: "debrief_not_started" });
      const current = store.getWorkMap(`wm_${session.id.replace(/^ses_/, "")}`);
      const question = current?.openQuestions.find((q) => q.id === body.data.questionId);
      if (!question) return reply.code(404).send({ code: "unknown_question" });

      const answer = {
        ticketId: "",
        slot: question.slot,
        question: question.text,
        answerSegmentIds: body.data.segmentIds,
      };
      const queueBefore = session.debriefQueue;
      session.answeredQuestions.push(answer);
      session.debriefQueue = session.debriefQueue.filter((q) => q.id !== question.id);
      try {
        const { map, open } = await rebuild(session);
        const count = askedSoFar + 1;
        asked.set(session.id, count);
        return DebriefStatus.parse({
          coverage: map.coverage,
          openQuestions: open,
          asked: count,
          done: doneRule(map.coverage, open, count),
        });
      } catch (err) {
        // Undo, so the client's retry records the answer once (not twice).
        const at = session.answeredQuestions.indexOf(answer);
        if (at !== -1) session.answeredQuestions.splice(at, 1);
        session.debriefQueue = queueBefore;
        req.log.warn({ sessionId: session.id, err: String(err) }, "debrief rebuild failed");
        return reply.code(422).send({ code: "map_unbuildable" });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/teachback",
    { config: CLAUDE_ROUTE_RATE_LIMIT },
    async (req, reply) => {
      const session = store.getSession(req.params.id);
      if (!session) return reply.code(404).send({ code: "unknown_session" });
      const map = store.getWorkMap(`wm_${session.id.replace(/^ses_/, "")}`);
      if (!map) return reply.code(409).send({ code: "no_workmap" });
      try {
        const text = await teachText(
          map,
          "Explain the whole triage process back to the expert for confirmation.",
        );
        return TeachBackResponse.parse({ text: text.slice(0, 1200) });
      } catch (err) {
        // A model failure is an ApiError the web client can show, not a bare 500.
        req.log.warn({ sessionId: session.id, err: String(err) }, "teach-back failed");
        return reply.code(502).send({ code: "llm_failed" });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/teachback/confirm",
    { config: CLAUDE_ROUTE_RATE_LIMIT },
    async (req, reply) => {
      const body = TeachBackConfirmRequest.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ code: "invalid_body" });
      const session = store.getSession(req.params.id);
      if (!session) return reply.code(404).send({ code: "unknown_session" });
      const mapId = `wm_${session.id.replace(/^ses_/, "")}`;
      const map = store.getWorkMap(mapId);
      if (!map) return reply.code(409).send({ code: "no_workmap" });

      if (body.data.confirmed) {
        const confirmed = { ...map, teachBackConfirmedAtMs: body.data.tMs };
        store.saveWorkMap(confirmed);
        return TeachBackConfirmResponse.parse({ workMap: confirmed });
      }
      if (body.data.correctionSegmentIds.length === 0) {
        return reply.code(400).send({ code: "correction_segments_required" });
      }
      session.answeredQuestions.push({
        ticketId: "",
        slot: "reason",
        question: "teach-back correction from the expert",
        answerSegmentIds: body.data.correctionSegmentIds,
      });
      try {
        const { map: rebuilt } = await rebuild(session);
        const recheck = await teachText(
          rebuilt,
          "In ONE short sentence, state only the corrected detail for the expert to re-confirm.",
        );
        return TeachBackConfirmResponse.parse({
          workMap: rebuilt,
          recheckText: recheck.slice(0, 300),
        });
      } catch (err) {
        req.log.warn({ sessionId: session.id, err: String(err) }, "teachback rebuild failed");
        return reply.code(422).send({ code: "map_unbuildable" });
      }
    },
  );
}
