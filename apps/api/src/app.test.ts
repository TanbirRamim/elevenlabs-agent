import { loadReferenceRules, loadTickets } from "@shadow/guard/fixtures";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv({ NODE_ENV: "test" });

describe("api", () => {
  it("reports health", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("blocks the N1 wrong refund before it is saved", async () => {
    const app = await buildApp({ env, fallbackRules: loadReferenceRules() });
    const n1 = loadTickets().find((t) => t.id === "N1");
    if (!n1) throw new Error("seed missing N1");
    const { label: _label, ...ticket } = n1;
    const res = await app.inject({
      method: "POST",
      url: "/guard/presave",
      payload: { ticket, outcome: "refund" },
    });
    expect(res.json()).toMatchObject({ decision: "BLOCK", expectedOutcome: "handoff_security" });
  });

  it("rejects malformed actions with 400", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({
      method: "POST",
      url: "/guard/presave",
      payload: { outcome: "refund" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates sessions", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mode: "capture" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toMatch(/^ses_/);
  });
});

describe("CORS for the web app", () => {
  it("allows the PUT and PATCH the browser sends (recording upload, Work Map edits)", async () => {
    const env = loadEnv({ NODE_ENV: "test", WEB_ORIGIN: "https://web.test" });
    const app = await buildApp({ env });
    for (const method of ["PUT", "PATCH"]) {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/sessions/ses_1/recording",
        headers: {
          origin: "https://web.test",
          "access-control-request-method": method,
          "access-control-request-headers": "content-type,x-shadow-session",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(String(res.headers["access-control-allow-methods"])).toContain(method);
      expect(String(res.headers["access-control-allow-headers"])).toContain("x-shadow-session");
    }
    await app.close();
  });
});
