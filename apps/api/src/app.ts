import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { RuleRef } from "@shadow/guard";
import { loadTickets } from "@shadow/guard/fixtures";
import type { Ticket } from "@shadow/schema";
import Fastify from "fastify";
import type { Env } from "./env.js";
import { registerGuardRoutes } from "./routes/guard.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { createMemoryStore, type Store } from "./store/memory.js";

export interface AppDeps {
  env: Env;
  store?: Store;
  fallbackRules?: RuleRef[];
  tickets?: Ticket[];
  /** Test override for the global per-IP limit (default 300/min). */
  rateLimitMax?: number;
}

export async function buildApp({
  env,
  store = createMemoryStore(),
  fallbackRules = [],
  tickets = loadTickets(),
  rateLimitMax = 300,
}: AppDeps) {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ["req.headers.authorization", 'req.headers["xi-api-key"]'],
          },
    bodyLimit: 4 * 1024 * 1024,
  });
  // WEB_ORIGIN may list several origins, comma-separated (local dev + the deployed web app).
  await app.register(cors, { origin: env.WEB_ORIGIN.split(",").map((o) => o.trim()) });
  await app.register(websocket, { options: { maxPayload: 4 * 1024 * 1024 } });
  // Must register before the routes: the plugin attaches limits via an onRoute hook.
  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: "1 minute",
    // statusCode is required for fastify to send 429; clients parse the body as ApiError.
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: ctx.statusCode,
      code: "rate_limited",
      message: `limit is ${ctx.max} per ${ctx.after}`,
    }),
  });

  app.get("/health", async () => ({ ok: true, model: env.SHADOW_MODEL }));
  registerTicketRoutes(app, tickets);
  registerGuardRoutes(app, store, fallbackRules);
  registerSessionRoutes(app, store);
  return app;
}
