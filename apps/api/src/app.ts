import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { RuleRef } from "@shadow/guard";
import Fastify from "fastify";
import type { Env } from "./env.js";
import { registerGuardRoutes } from "./routes/guard.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { createMemoryStore, type Store } from "./store/memory.js";

export interface AppDeps {
  env: Env;
  store?: Store;
  fallbackRules?: RuleRef[];
}

export async function buildApp({ env, store = createMemoryStore(), fallbackRules = [] }: AppDeps) {
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

  app.get("/health", async () => ({ ok: true, model: env.SHADOW_MODEL }));
  registerGuardRoutes(app, store, fallbackRules);
  registerSessionRoutes(app, store);
  return app;
}
