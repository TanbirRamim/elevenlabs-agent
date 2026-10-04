import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { RuleRef } from "@shadow/guard";
import { loadTickets } from "@shadow/guard/fixtures";
import { PublicTicket, type Ticket } from "@shadow/schema";
import Fastify from "fastify";
import { createCuriosityEngine } from "./curiosity/engine.js";
import type { Env } from "./env.js";
import type { JudgeDeps } from "./llm/judge.js";
import { createLlm } from "./llm/structured.js";
import { loadMockFixtures } from "./mock/fixtures.js";
import { registerMockRoutes } from "./mock/routes.js";
import { createMockStreamHooks } from "./mock/stream.js";
import { createFrameProcessor } from "./pipeline/frames.js";
import { createPresidioRedactor, identityRedactor } from "./privacy/presidio.js";
import { createPresidioImageRedactor } from "./privacy/presidioImage.js";
import {
  type DebriefDeps,
  registerDebriefRoutes,
  registerDebriefUnavailableRoutes,
} from "./routes/debrief.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerGuardRoutes } from "./routes/guard.js";
import { registerRecordingRoutes } from "./routes/recording.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTeachRoutes } from "./routes/teach.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerWorkMapRoutes } from "./routes/workmaps.js";
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
  /** Test override: a fake LlmDeps (or null to force no-LLM mode) instead of the env key. */
  llm?: ReturnType<typeof createLlm> | null;
  /** Test seams for the debrief routes (fake map generation / teach-back text). */
  debriefSeams?: Omit<DebriefDeps, "llm">;
  /** Test seams for the guard judge (fake decide fn / timeout). */
  judgeSeams?: JudgeDeps;
  /** Test override for the global per-IP limit (default 300/min). */
  rateLimitMax?: number;
}

export async function buildApp({
  env,
  store = createMemoryStore(),
  fallbackRules = [],
  tickets = loadTickets(),
  storage,
  llm: llmOverride,
  debriefSeams,
  judgeSeams,
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
  const llm =
    llmOverride !== undefined
      ? llmOverride
      : env.ANTHROPIC_API_KEY && env.MOCK_AI !== "1"
        ? createLlm(env.ANTHROPIC_API_KEY, env.SHADOW_MODEL)
        : null;
  const judge = { judge: { timeoutMs: env.GUARD_JUDGE_TIMEOUT_MS, ...judgeSeams } };
  registerGuardRoutes(app, store, fallbackRules, { llm, ...judge });
  registerRecordingRoutes(app, store, objectStorage);
  if (env.MOCK_AI === "1") {
    // Fixture mode: no Claude or Presidio calls anywhere (HAR-3). The Work Map routes are
    // the real store-backed ones over the fixture map, and so are predictions, mastery and the
    // Copilot export (none call Claude here); the debrief is a fixture stand-in.
    // No frameSink either: frames cannot be redacted without Presidio, so none are stored.
    const fixtures = loadMockFixtures();
    registerMockRoutes(app, store, fixtures);
    registerWorkMapRoutes(app, store, { publishedFallback: fixtures.workMap });
    registerTeachRoutes(app, store, { tickets, publishedFallback: fixtures.workMap });
    registerExportRoutes(app, store, {
      tickets,
      publishedFallback: fixtures.workMap,
      llm,
      ...judge,
    });
    registerSessionRoutes(app, store, {
      hooks: createMockStreamHooks(fixtures),
      redactText: identityRedactor, // fixture text only, no PII
    });
  } else {
    const redactImage = createPresidioImageRedactor({
      url: env.PRESIDIO_IMAGE_REDACTOR_URL,
      log: app.log,
    });
    // Without a key, frames are stored (redacted) but never shown to a model.
    const ticketsById = new Map(tickets.map((t) => [t.id, PublicTicket.parse(t)]));
    registerWorkMapRoutes(app, store);
    registerTeachRoutes(app, store, { tickets });
    registerExportRoutes(app, store, { tickets, llm, ...judge });
    if (llm) registerDebriefRoutes(app, store, { llm, ...debriefSeams });
    else registerDebriefUnavailableRoutes(app);
    registerSessionRoutes(app, store, {
      redactText: createPresidioRedactor({
        analyzerUrl: env.PRESIDIO_ANALYZER_URL,
        anonymizerUrl: env.PRESIDIO_ANONYMIZER_URL,
        allowList: tickets.map((t) => t.id),
        log: app.log,
      }),
      ...(objectStorage || llm
        ? {
            pipes: (session, send) => {
              // Cross-wired per connection: the engine reads the sink's screenAnswers,
              // the sink feeds decisions and the open-gap count into the insight message.
              let sinkRef: ReturnType<typeof createFrameProcessor> | undefined;
              const curiosity = llm
                ? createCuriosityEngine({
                    session,
                    send,
                    llm,
                    ticketsById,
                    screenAnswers: () => sinkRef?.screenAnswers() ?? [],
                    log: app.log,
                  })
                : undefined;
              const sink = createFrameProcessor({
                session,
                send,
                llm,
                redactImage,
                storage: objectStorage,
                log: app.log,
                ...(curiosity ? { onDecision: (tMs) => curiosity.onVisionDecision(tMs) } : {}),
              });
              sinkRef = sink;
              if (curiosity) sink.setOpenGaps(() => curiosity.openGapCount());
              return { sink, ...(curiosity ? { curiosity } : {}) };
            },
          }
        : {}),
    });
  }
  return app;
}
