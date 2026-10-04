import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { RuleRef } from "@shadow/guard";
import { loadTickets } from "@shadow/guard/fixtures";
import type { Ticket } from "@shadow/schema";
import Fastify from "fastify";
import type { Env } from "./env.js";
import { loadMockFixtures } from "./mock/fixtures.js";
import { registerMockRoutes } from "./mock/routes.js";
import { createMockStreamHooks } from "./mock/stream.js";
import { createFramePipeline } from "./privacy/frames.js";
import { createPresidioRedactor, identityRedactor } from "./privacy/presidio.js";
import { createPresidioImageRedactor } from "./privacy/presidioImage.js";
import { registerGuardRoutes } from "./routes/guard.js";
import { registerRecordingRoutes } from "./routes/recording.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { createS3Storage } from "./storage/s3.js";
import type { ObjectStorage } from "./storage/types.js";
import { createMemoryStore, type Store } from "./store/memory.js";

export interface AppDeps {
  env: Env;
  store?: Store;
  fallbackRules?: RuleRef[];
  tickets?: Ticket[];
  /** Test override: inject a fake ObjectStorage, or null to simulate no storage. */
  storage?: ObjectStorage | null;
  /** Test override for the global per-IP limit (default 300/min). */
  rateLimitMax?: number;
}

export async function buildApp({
  env,
  store = createMemoryStore(),
  fallbackRules = [],
  tickets = loadTickets(),
  storage,
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
  // Recording upload/replay works in both modes (RustFS is local, no AI keys involved).
  const objectStorage = storage !== undefined ? storage : await createS3Storage(env, app.log);
  registerTicketRoutes(app, tickets);
  registerGuardRoutes(app, store, fallbackRules);
  registerRecordingRoutes(app, store, objectStorage);
  if (env.MOCK_AI === "1") {
    // Fixture mode: no Claude or Presidio calls anywhere (HAR-3). The real
    // debrief/workmap/mastery routes (HAR-9, HAR-12) will register in the else branch.
    // No storeFrame either: frames cannot be redacted without Presidio, so none are stored.
    const fixtures = loadMockFixtures();
    registerMockRoutes(app, store, fixtures);
    registerSessionRoutes(app, store, {
      hooks: createMockStreamHooks(fixtures),
      redactText: identityRedactor, // fixture text only, no PII
    });
  } else {
    const redactImage = createPresidioImageRedactor({
      url: env.PRESIDIO_IMAGE_REDACTOR_URL,
      log: app.log,
    });
    registerSessionRoutes(app, store, {
      redactText: createPresidioRedactor({
        analyzerUrl: env.PRESIDIO_ANALYZER_URL,
        anonymizerUrl: env.PRESIDIO_ANONYMIZER_URL,
        log: app.log,
      }),
      ...(objectStorage
        ? { storeFrame: createFramePipeline(redactImage, objectStorage, app.log) }
        : {}),
    });
  }
  return app;
}
