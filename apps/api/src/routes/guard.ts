import { evaluate, type RuleRef } from "@shadow/guard";
import { type GuardVerdict, PendingAction } from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CLAUDE_ROUTE_RATE_LIMIT } from "../limits.js";
import { escalate, JUDGED_OUTCOMES, type JudgeDeps, judgeAction } from "../llm/judge.js";
import type { LlmDeps } from "../llm/structured.js";
import type { Store } from "../store/memory.js";

export function rulesFromStore(store: Store, fallback: RuleRef[]): RuleRef[] {
  const map = store.getPublishedWorkMap();
  if (!map) return fallback;
  return map.guardrails.flatMap((g) =>
    g.machineRule ? [{ id: g.id, machineRule: g.machineRule }] : [],
  );
}

const PresaveQuery = z.object({ sessionId: z.string().optional() });

export interface GuardRouteDeps {
  /** null: no key — machine rules only, never a judge call. */
  llm?: LlmDeps | null;
  judge?: JudgeDeps;
}

export function registerGuardRoutes(
  app: FastifyInstance,
  store: Store,
  fallback: RuleRef[],
  { llm = null, judge }: GuardRouteDeps = {},
): void {
  // Calls Claude (the judge) from HAR-11 on, so it carries the Claude-route limit.
  app.post("/guard/presave", { config: CLAUDE_ROUTE_RATE_LIMIT }, async (req, reply) => {
    const parsed = PendingAction.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_action", issues: parsed.error.issues });
    }
    const action = parsed.data;
    let verdict: GuardVerdict = evaluate(action, rulesFromStore(store, fallback));

    // A risky outcome the machine rules did not BLOCK gets the LLM second opinion against
    // the published map's full guardrails — including the ones without machine rules. It
    // also runs after a REQUIRE_APPROVAL/WARN (N1: G1 fires, the fraud rule is only spoken).
    const map = store.getPublishedWorkMap();
    if (
      verdict.decision !== "BLOCK" &&
      JUDGED_OUTCOMES.includes(action.outcome) &&
      llm &&
      map &&
      map.guardrails.length > 0
    ) {
      const judged = await judgeAction(llm, action, map.guardrails, {
        log: req.log,
        ...judge,
      });
      verdict = escalate(verdict, judged);
    }

    // Recorded for the mastery report (HAR-12); the teach page passes ?sessionId=.
    const query = PresaveQuery.safeParse(req.query);
    if (query.success && query.data.sessionId) {
      const session = store.getSession(query.data.sessionId);
      session?.guardVerdicts.push({
        ticketId: action.ticket.id,
        outcome: action.outcome,
        verdict,
        at: Date.now(),
      });
    }

    req.log.info({ ticket: action.ticket.id, outcome: action.outcome, verdict }, "guard");
    return verdict;
  });
}
