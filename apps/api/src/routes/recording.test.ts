import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findSeedDir } from "@shadow/guard/fixtures";
import { WorkMap } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import { createMemoryObjectStorage } from "../storage/memory.js";
import { createMemoryStore } from "../store/memory.js";

const fixtureMap = WorkMap.parse(
  JSON.parse(readFileSync(join(findSeedDir(), "fixtures", "workmap.json"), "utf8")),
);

const env = loadEnv({ NODE_ENV: "test" });
const WEBM = Buffer.from("0123456789abcdef"); // 16 bytes standing in for a webm

async function setup() {
  const storage = createMemoryObjectStorage();
  const app = await buildApp({ env, storage });
  const created = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { mode: "capture" },
  });
  return { app, storage, sessionId: created.json<{ id: string }>().id };
}

describe("recording routes", () => {
  it("stores an upload and serves it back whole", async () => {
    const { app, storage, sessionId } = await setup();
    const put = await app.inject({
      method: "PUT",
      url: `/sessions/${sessionId}/recording`,
      headers: { "content-type": "video/webm" },
      payload: WEBM,
    });
    expect(put.statusCode).toBe(204);
    expect(storage.objects.get(`recordings/${sessionId}.webm`)?.body.equals(WEBM)).toBe(true);

    const get = await app.inject({ method: "GET", url: `/sessions/${sessionId}/recording` });
    expect(get.statusCode).toBe(200);
    expect(get.headers["accept-ranges"]).toBe("bytes");
    expect(get.rawPayload.equals(WEBM)).toBe(true);
  });

  it("serves a Range request with 206 and the right slice", async () => {
    const { app, sessionId } = await setup();
    await app.inject({
      method: "PUT",
      url: `/sessions/${sessionId}/recording`,
      headers: { "content-type": "video/webm" },
      payload: WEBM,
    });
    const res = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/recording`,
      headers: { range: "bytes=4-7" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 4-7/${WEBM.length}`);
    expect(res.rawPayload.toString()).toBe("4567");
  });

  it("416s an unsatisfiable range", async () => {
    const { app, sessionId } = await setup();
    await app.inject({
      method: "PUT",
      url: `/sessions/${sessionId}/recording`,
      headers: { "content-type": "video/webm" },
      payload: WEBM,
    });
    const res = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/recording`,
      headers: { range: "bytes=99-" },
    });
    expect(res.statusCode).toBe(416);
  });

  it("404s unknown sessions and missing recordings", async () => {
    const { app, sessionId } = await setup();
    const unknown = await app.inject({ method: "GET", url: "/sessions/ses_nope/recording" });
    expect(unknown.statusCode).toBe(404);
    const missing = await app.inject({ method: "GET", url: `/sessions/${sessionId}/recording` });
    expect(missing.statusCode).toBe(404);
  });

  it("503s when storage is not configured", async () => {
    const app = await buildApp({ env, storage: null });
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mode: "capture" },
    });
    const res = await app.inject({
      method: "PUT",
      url: `/sessions/${created.json<{ id: string }>().id}/recording`,
      headers: { "content-type": "video/webm" },
      payload: WEBM,
    });
    expect(res.statusCode).toBe(503);
  });
});

describe("frame route", () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

  it("serves a stored frame from the key the frame pipeline writes", async () => {
    const { app, storage, sessionId } = await setup();
    // The same key apps/api/src/pipeline/frames.ts puts a redacted frame under.
    await storage.put(`frames/${sessionId}/f_1.jpg`, JPEG, "image/jpeg");
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}/frames/f_1.jpg` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.rawPayload.equals(JPEG)).toBe(true);
  });

  it("serves the published map's frames after its source session is gone", async () => {
    const storage = createMemoryObjectStorage();
    const store = createMemoryStore();
    const map = { ...fixtureMap, sourceSessionId: "ses_gone" };
    store.saveWorkMap(map);
    store.publishWorkMap(map);
    const app = await buildApp({ env, store, storage });
    await storage.put("frames/ses_gone/f_9.jpg", JPEG, "image/jpeg");
    const res = await app.inject({ method: "GET", url: "/sessions/ses_gone/frames/f_9.jpg" });
    expect(res.statusCode).toBe(200);
    const other = await app.inject({ method: "GET", url: "/sessions/ses_other/frames/f_9.jpg" });
    expect(other.statusCode).toBe(404);
  });

  it("404s a missing frame, an unknown session and a bad file name", async () => {
    const { app, sessionId } = await setup();
    const missing = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/frames/f_2.jpg`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ code: "no_frame" });
    const unknown = await app.inject({ method: "GET", url: "/sessions/ses_nope/frames/f_1.jpg" });
    expect(unknown.statusCode).toBe(404);
    const bad = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/frames/..%2Fx.jpg`,
    });
    expect(bad.statusCode).toBe(404);
    const png = await app.inject({ method: "GET", url: `/sessions/${sessionId}/frames/f_1.png` });
    expect(png.statusCode).toBe(404);
  });

  it("503s when storage is not configured", async () => {
    const app = await buildApp({ env, storage: null });
    const res = await app.inject({ method: "GET", url: "/sessions/ses_1/frames/f_1.jpg" });
    expect(res.statusCode).toBe(503);
  });
});
