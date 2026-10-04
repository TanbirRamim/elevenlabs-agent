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
import { outcomeFromText } from "../pipeline/metrics.js";
import type { SessionRecord, Store } from "../store/memory.js";
import { type BuildDeps, buildWorkMap } from "../workmap/build.js";

const TeachBackText = z.object({ text: z.string() });
const MAX_ASKED = 8;
/** §6.7 hard cap: 8 questions or 5 minutes, counted from End task. */
const MAX_DEBRIEF_MS = 5 * 60_000;

export interface DebriefDeps {
  llm: LlmDeps;
  /** Test seams. */
  buildDeps?: BuildDeps;
  teachBackText?: (map: WorkMap, instruction: string) => Promise<string>;
  now?: () => number;
  /** Quiet time before a background rebuild starts (answers in a burst share one build). */
  rebuildDebounceMs?: number;
}

/** Outcomes seen on screen: vision "action" events, plus DOM commits in vision+desk mode. */
function observedOutcomes(session: SessionRecord): Outcome[] {
  return session.events.flatMap((e) => {
    const p = e.payload as { type?: string; outcome?: Outcome; kind?: string };
    if (e.source === "dom") return p.type === "action_committed" && p.outcome ? [p.outcome] : [];
    const outcome = p.kind === "action" ? outcomeFromText(e.summary) : null;
    return outcome ? [outcome] : [];
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

function doneRule(
  coverage: number,
  open: OpenQuestion[],
  asked: number,
  elapsedMs: number,
): boolean {
  if (asked >= MAX_ASKED || elapsedMs >= MAX_DEBRIEF_MS) return true;
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

/**
 * Coalesces Work Map rebuilds for one session: debounced, at most one in flight, and a request
 * that arrives mid-build runs once more afterwards with everything answered so far (latest wins).
 */
export interface Rebuilder {
  schedule(): void;
  /** A build is running or queued. */
  pending(): boolean;
  /** Resolves once nothing is running or queued (failures included). */
  idle(): Promise<void>;
}

export function createRebuilder(
  run: () => Promise<void>,
  debounceMs: number,
  onError: (err: unknown) => void,
): Rebuilder {
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let dirty = false;
  let waiters: (() => void)[] = [];
  const settle = () => {
    const ws = waiters;
    waiters = [];
    for (const w of ws) w();
  };
  const start = async () => {
    timer = undefined;
    if (!dirty) return settle();
    dirty = false;
    running = true;
    try {
      await run();
    } catch (err) {
      onError(err);
    } finally {
      running = false;
      if (dirty) timer = setTimeout(() => void start(), debounceMs);
      else settle();
    }
  };
  return {
    schedule() {
      dirty = true;
      if (running) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void start(), debounceMs);
    },
    pending: () => running || dirty,
    idle: () =>
      running || dirty ? new Promise<void>((resolve) => waiters.push(resolve)) : Promise.resolve(),
  };
}

interface DebriefState {
  asked: number;
  startedAt: number;
  /** Coverage of the last verified build; the done rule reads it. */
  coverage: number;
  /** Every question the client was offered, so an id stays answerable after a rebuild. */
  offered: Map<string, OpenQuestion>;
  answeredIds: Set<string>;
  /** Teach-back confirmed while a rebuild was pending: stamp the rebuilt map too. */
  confirmedAtMs: number | null;
  rebuilder: Rebuilder;
}

/**
 * POST /sessions/:id/end, debrief/answer, teachback(+confirm); GET /sessions/:id/debrief.
 * Only /end waits for a Work Map build. A debrief answer is recorded and answered at once from
 * the gap ledger (open questions of the last verified map + debrief queue + unseen-case probes);
 * the map is rebuilt and evidence-verified in the background (§6.6 unchanged).
 */
export function registerDebriefRoutes(
  app: FastifyInstance,
  store: Store,
  { llm, buildDeps, teachBackText, now = Date.now, rebuildDebounceMs = 1500 }: DebriefDeps,
): void {
  const states = new Map<string, DebriefState>();
  const mapIdOf = (session: SessionRecord) => `wm_${session.id.replace(/^ses_/, "")}`;
  const teachText =
    teachBackText ??
    (async (map: WorkMap, instruction: string) => {
      const out = await structured(llm, teachBack, TeachBackText, [
        { type: "text", text: `${instruction}\n\nWork Map:\n${JSON.stringify(map)}` },
      ]);
      return out.text;
    });

  const offer = (state: DebriefState | undefined, open: OpenQuestion[]) => {
    for (const q of open) state?.offered.set(q.id, q);
  };

  /** Build + verify + save. Keeps a teach-back stamp given while this build was pending. */
  const rebuild = async (
    session: SessionRecord,
  ): Promise<{ map: WorkMap; open: OpenQuestion[] }> => {
    const { map } = await buildWorkMap(llm, session, session.answeredQuestions, buildDeps ?? {});
    const open = mergeOpenQuestions(map, session);
    const state = states.get(session.id);
    const withOpen = {
      ...map,
      openQuestions: open,
      teachBackConfirmedAtMs: state?.confirmedAtMs ?? map.teachBackConfirmedAtMs,
    };
    store.saveWorkMap(withOpen);
    if (state) state.coverage = map.coverage;
    offer(state, open);
    return { map: withOpen, open };
  };

  const status = (session: SessionRecord, state: DebriefState) => {
    const current = store.getWorkMap(mapIdOf(session));
    const open = current ? mergeOpenQuestions(current, session) : [];
    return {
      open,
      body: DebriefStatus.parse({
        coverage: state.coverage,
        openQuestions: open,
        asked: state.asked,
        done: doneRule(state.coverage, open, state.asked, now() - state.startedAt),
      }),
    };
  };

  /** Expert answers that the last saved map may not contain yet (a rebuild is pending). */
  const pendingAnswers = (session: SessionRecord, state: DebriefState | undefined): string => {
    if (!state?.rebuilder.pending()) return "";
    const byId = new Map(session.transcript.map((t) => [t.id, t]));
    const lines = session.answeredQuestions.slice(-8).map(
      (a) =>
        `- Q: ${a.question}\n  A: ${a.answerSegmentIds
          .map((id) => byId.get(id))
          .filter((t) => t && !t.offRecord)
          .map((t) => t?.text)
          .join(" ")}`,
    );
    return lines.length
      ? `\n\nThe expert also just answered these (not yet in the Work Map; include them):\n${lines.join("\n")}`
      : "";
  };

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/end",
    { config: CLAUDE_ROUTE_RATE_LIMIT },
    async (req, reply) => {
      const session = store.getSession(req.params.id);
      if (!session) return reply.code(404).send({ code: "unknown_session" });
      try {
        const { map, open } = await rebuild(session);
        const state: DebriefState = {
          asked: 0,
          startedAt: now(),
          coverage: map.coverage,
          offered: new Map(),
          answeredIds: new Set(),
          confirmedAtMs: null,
          rebuilder: createRebuilder(
            async () => {
              await rebuild(session);
            },
            rebuildDebounceMs,
            (err) =>
              // The answer stays recorded; the last verified map stays served.
              req.log.warn({ sessionId: session.id, err: String(err) }, "debrief rebuild failed"),
          ),
        };
        states.set(session.id, state);
        offer(state, open);
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

  // Latest coverage + open questions; header x-shadow-rebuilding says a rebuild is pending.
  app.get<{ Params: { id: string } }>("/sessions/:id/debrief", async (req, reply) => {
    const session = store.getSession(req.params.id);
    if (!session) return reply.code(404).send({ code: "unknown_session" });
    const state = states.get(session.id);
    if (!state) return reply.code(409).send({ code: "debrief_not_started" });
    reply.header("x-shadow-rebuilding", state.rebuilder.pending() ? "1" : "0");
    return status(session, state).body;
  });

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/debrief/answer",
    { config: CLAUDE_ROUTE_RATE_LIMIT },
    async (req, reply) => {
      const body = DebriefAnswerRequest.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ code: "invalid_body" });
      const session = store.getSession(req.params.id);
      if (!session) return reply.code(404).send({ code: "unknown_session" });
      const state = states.get(session.id);
      if (!state) return reply.code(409).send({ code: "debrief_not_started" });
      const { questionId, segmentIds } = body.data;
      // A client retry of an answer already recorded is not counted twice.
      if (state.answeredIds.has(questionId)) return status(session, state).body;
      const current = store.getWorkMap(mapIdOf(session));
      const question =
        current?.openQuestions.find((q) => q.id === questionId) ?? state.offered.get(questionId);
      if (!question) return reply.code(404).send({ code: "unknown_question" });

      session.answeredQuestions.push({
        ticketId: "",
        slot: question.slot,
        question: question.text,
        answerSegmentIds: segmentIds,
      });
      session.debriefQueue = session.debriefQueue.filter((q) => q.id !== question.id);
      state.answeredIds.add(questionId);
      state.asked += 1;
      const { open, body: out } = status(session, state);
      // Keep the served map's open questions in step with the ledger until the rebuild lands.
      if (current) store.saveWorkMap({ ...current, openQuestions: open });
      offer(state, open);
      state.rebuilder.schedule();
      return out;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/sessions/:id/teachback",
    { config: CLAUDE_ROUTE_RATE_LIMIT },
    async (req, reply) => {
      const session = store.getSession(req.params.id);
      if (!session) return reply.code(404).send({ code: "unknown_session" });
      const map = store.getWorkMap(mapIdOf(session));
      if (!map) return reply.code(409).send({ code: "no_workmap" });
      try {
        const text = await teachText(
          map,
          `Explain the whole triage process back to the expert for confirmation.${pendingAnswers(session, states.get(session.id))}`,
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
      const state = states.get(session.id);
      if (!store.getWorkMap(mapIdOf(session))) return reply.code(409).send({ code: "no_workmap" });

      if (body.data.confirmed) {
        if (state) {
          state.confirmedAtMs = body.data.tMs;
          // The confirmed map is the one that gets published: it must hold every answer.
          await state.rebuilder.idle();
        }
        const latest = store.getWorkMap(mapIdOf(session));
        if (!latest) return reply.code(409).send({ code: "no_workmap" });
        const confirmed = { ...latest, teachBackConfirmedAtMs: body.data.tMs };
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
        let map = store.getWorkMap(mapIdOf(session));
        if (state) {
          state.confirmedAtMs = null;
          state.rebuilder.schedule();
        } else {
          map = (await rebuild(session)).map;
        }
        if (!map) return reply.code(409).send({ code: "no_workmap" });
        const recheck = await teachText(
          map,
          `In ONE short sentence, state only the corrected detail for the expert to re-confirm.${pendingAnswers(session, state)}`,
        );
        return TeachBackConfirmResponse.parse({ workMap: map, recheckText: recheck.slice(0, 300) });
      } catch (err) {
        req.log.warn({ sessionId: session.id, err: String(err) }, "teachback rebuild failed");
        return reply.code(422).send({ code: "map_unbuildable" });
      }
    },
  );
}
