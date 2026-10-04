import { type RuleRef, rulesFromWorkMap } from "@shadow/guard";
import { Id, PendingAction } from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CLAUDE_ROUTE_RATE_LIMIT } from "../limits.js";
import { type JudgeDeps, runGuard } from "../llm/judge.js";
import type { LlmDeps } from "../llm/structured.js";
import type { Store } from "../store/memory.js";

export function rulesFromStore(store: Store, fallback: RuleRef[]): RuleRef[] {
  const map = store.getPublishedWorkMap();
  return map ? rulesFromWorkMap(map) : fallback;
}

const PresaveQuery = z.object({ sessionId: Id.optional() });

/** Which teach session is saving: the `x-shadow-session` header, else `?sessionId=`. */
function sessionIdOf(headers: Record<string, unknown>, query: unknown): string | null {
  const header = Id.safeParse(headers["x-shadow-session"]);
  if (header.success) return header.data;
  const fromQuery = PresaveQuery.safeParse(query);
  return fromQuery.success ? (fromQuery.data.sessionId ?? null) : null;
}

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
    // Machine rules, then the judge for a risky outcome they did not BLOCK (N1: G1 fires,
    // the fraud rule is only spoken) — see runGuard.
    const verdict = await runGuard(action, {
      map: store.getPublishedWorkMap(),
      fallbackRules: fallback,
      llm,
      judge: { log: req.log, ...judge },
    });

    // Recorded for the mastery report (HAR-12); the teach page sends x-shadow-session.
    const sessionId = sessionIdOf(req.headers, req.query);
    if (sessionId) {
      store.getSession(sessionId)?.guardVerdicts.push({
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
