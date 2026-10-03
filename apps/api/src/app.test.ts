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
