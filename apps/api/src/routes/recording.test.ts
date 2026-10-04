import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import { createMemoryObjectStorage } from "../storage/memory.js";

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
