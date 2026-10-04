import { WorkMap, WorkMapPatch } from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import type { Store } from "../store/memory.js";
import { workMapToMarkdown } from "../workmap/markdown.js";
import { predictionVariants } from "../workmap/predictions.js";

/** Draft + published Work Map endpoints. None of these call Claude. */
export function registerWorkMapRoutes(app: FastifyInstance, store: Store): void {
  const find = (id: string) => {
    const draft = store.getWorkMap(id);
    if (draft) return draft;
    const published = store.getPublishedWorkMap();
    return published?.id === id ? published : undefined;
  };

  app.get("/workmaps/published", async (_req, reply) => {
    const map = store.getPublishedWorkMap();
    if (!map) return reply.code(404).send({ code: "nothing_published" });
    return map;
  });

  app.get<{ Params: { id: string } }>("/workmaps/:id", async (req, reply) => {
    const map = find(req.params.id);
    if (!map) return reply.code(404).send({ code: "unknown_workmap" });
    return map;
  });

  app.patch<{ Params: { id: string } }>("/workmaps/:id", async (req, reply) => {
    const body = WorkMapPatch.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ code: "invalid_patch" });
    const map = find(req.params.id);
    if (!map) return reply.code(404).send({ code: "unknown_workmap" });
    const dropSteps = new Set(body.data.deleteStepIds);
    const dropGuardrails = new Set(body.data.deleteGuardrailIds);
    const steps = map.steps.filter((s) => !dropSteps.has(s.id));
    if (steps.length === 0) {
      return reply.code(400).send({ code: "cannot_delete_all_steps" });
    }
    const guardrails = map.guardrails.filter((g) => !dropGuardrails.has(g.id));
    const guardrailIds = new Set(guardrails.map((g) => g.id));
    const patched = WorkMap.parse({
      ...map,
      version: map.version + 1,
      steps: steps.map((s) => ({
        ...s,
        guardrailIds: s.guardrailIds.filter((id) => guardrailIds.has(id)),
      })),
      guardrails,
    });
    store.saveWorkMap(patched);
    return patched;
  });

  app.post<{ Params: { id: string } }>("/workmaps/:id/publish", async (req, reply) => {
    const map = find(req.params.id);
    if (!map) return reply.code(404).send({ code: "unknown_workmap" });
    store.publishWorkMap(map);
    return { id: map.id };
  });

  app.get<{ Params: { id: string } }>("/workmaps/:id/markdown", async (req, reply) => {
    const map = find(req.params.id);
    if (!map) return reply.code(404).send({ code: "unknown_workmap" });
    return reply.type("text/markdown; charset=utf-8").send(workMapToMarkdown(map));
  });

  app.post<{ Params: { id: string } }>("/workmaps/:id/predictions", async (req, reply) => {
    const map = find(req.params.id);
    if (!map) return reply.code(404).send({ code: "unknown_workmap" });
    return predictionVariants(map);
  });
}
