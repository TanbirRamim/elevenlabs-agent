import { evaluate, type RuleRef } from "@shadow/guard";
import { PendingAction } from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { CLAUDE_ROUTE_RATE_LIMIT } from "../limits.js";
import type { Store } from "../store/memory.js";

export function rulesFromStore(store: Store, fallback: RuleRef[]): RuleRef[] {
  const map = store.getPublishedWorkMap();
  if (!map) return fallback;
  return map.guardrails.flatMap((g) =>
    g.machineRule ? [{ id: g.id, machineRule: g.machineRule }] : [],
  );
}

export function registerGuardRoutes(app: FastifyInstance, store: Store, fallback: RuleRef[]): void {
  // Calls Claude from HAR-11 on, so it carries the Claude-route limit already.
  app.post("/guard/presave", { config: CLAUDE_ROUTE_RATE_LIMIT }, async (req, reply) => {
    const parsed = PendingAction.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_action", issues: parsed.error.issues });
    }
    const verdict = evaluate(parsed.data, rulesFromStore(store, fallback));
    req.log.info({ ticket: parsed.data.ticket.id, outcome: parsed.data.outcome, verdict }, "guard");
    return verdict;
  });
}
