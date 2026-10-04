import type { FastifyInstance } from "fastify";
import type { ObjectStorage } from "../storage/types.js";
import type { Store } from "../store/memory.js";

/** MediaRecorder output for a whole session; the Work Map and tutor seek into it for clips. */
const WEBM_BODY_LIMIT = 200 * 1024 * 1024;

export function registerRecordingRoutes(
  app: FastifyInstance,
  store: Store,
  storage: ObjectStorage | null,
): void {
  app.addContentTypeParser(
    "video/webm",
    { parseAs: "buffer", bodyLimit: WEBM_BODY_LIMIT },
    (_req, body, done) => done(null, body),
  );

  app.put<{ Params: { id: string } }>(
    "/sessions/:id/recording",
    { bodyLimit: WEBM_BODY_LIMIT },
    async (req, reply) => {
      if (!storage) return reply.code(503).send({ code: "storage_unavailable" });
      if (!store.getSession(req.params.id))
        return reply.code(404).send({ code: "unknown_session" });
      if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ code: "expected_webm" });
      await storage.put(`recordings/${req.params.id}.webm`, req.body, "video/webm");
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>("/sessions/:id/recording", async (req, reply) => {
    if (!storage) return reply.code(503).send({ code: "storage_unavailable" });
    // The published map's source session may be gone after a wiped disk while its recording
    // was restored from the boot dir (boot.ts), so that one id stays replayable.
    const isPublishedSource = store.getPublishedWorkMap()?.sourceSessionId === req.params.id;
    if (!store.getSession(req.params.id) && !isPublishedSource)
      return reply.code(404).send({ code: "unknown_session" });
    const result = await storage.get(`recordings/${req.params.id}.webm`, req.headers.range);
    if (result.status === 404) return reply.code(404).send({ code: "no_recording" });
    if (result.status === 416) {
      return reply.code(416).header("content-range", "bytes */*").send();
    }
    reply.code(result.status).header("accept-ranges", "bytes").header("content-type", "video/webm");
    if (result.contentRange) reply.header("content-range", result.contentRange);
    if (result.contentLength !== undefined) reply.header("content-length", result.contentLength);
    return reply.send(result.body);
  });
}
