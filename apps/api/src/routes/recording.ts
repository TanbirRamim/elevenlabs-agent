import type { FastifyInstance } from "fastify";
import type { ObjectStorage } from "../storage/types.js";
import type { Store } from "../store/memory.js";

/** MediaRecorder output for a whole session; the Work Map and tutor seek into it for clips. */
const WEBM_BODY_LIMIT = 200 * 1024 * 1024;
/** `<frameId>.jpg`; the id charset keeps the storage key safe (no "/", no ".."). */
const FRAME_FILE = /^([A-Za-z0-9_-]{1,64})\.jpg$/;

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

  // The published map's source session may be gone after a wiped disk while its recording
  // was restored from the boot dir (boot.ts), so that one id stays replayable.
  const knownSession = (id: string): boolean =>
    store.getSession(id) !== undefined || store.getPublishedWorkMap()?.sourceSessionId === id;

  // A redacted frame, stored by the frame pipeline under frames/<sessionId>/<frameId>.jpg; the
  // Work Map shows it as the clip poster. Frame ids are per session, so the session is in the path.
  app.get<{ Params: { id: string; file: string } }>(
    "/sessions/:id/frames/:file",
    async (req, reply) => {
      if (!storage) return reply.code(503).send({ code: "storage_unavailable" });
      if (!knownSession(req.params.id)) return reply.code(404).send({ code: "unknown_session" });
      const frameId = FRAME_FILE.exec(req.params.file)?.[1];
      if (!frameId) return reply.code(404).send({ code: "no_frame" });
      const result = await storage.get(`frames/${req.params.id}/${frameId}.jpg`);
      if (result.status !== 200) return reply.code(404).send({ code: "no_frame" });
      reply.header("content-type", "image/jpeg");
      if (result.contentLength !== undefined) reply.header("content-length", result.contentLength);
      return reply.send(result.body);
    },
  );

  app.get<{ Params: { id: string } }>("/sessions/:id/recording", async (req, reply) => {
    if (!storage) return reply.code(503).send({ code: "storage_unavailable" });
    if (!knownSession(req.params.id)) return reply.code(404).send({ code: "unknown_session" });
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
