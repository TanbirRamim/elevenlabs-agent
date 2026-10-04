import { ApiError, TicketsResponse } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";

const env = loadEnv({ NODE_ENV: "test" });

describe("GET /tickets", () => {
  it.each(["expert", "new_hire", "held_out"] as const)(
    "returns the %s set with no label in the body",
    async (set) => {
      const app = await buildApp({ env });
      const res = await app.inject({ method: "GET", url: `/tickets?set=${set}` });
      expect(res.statusCode).toBe(200);
      // The strongest form of "no response body contains label": the raw body string.
      expect(res.body).not.toContain('"label"');
      const parsed = TicketsResponse.parse(res.json());
      expect(parsed.tickets.length).toBeGreaterThan(0);
    },
  );

  it("returns the expert tickets T1-T10", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({ method: "GET", url: "/tickets?set=expert" });
    const parsed = TicketsResponse.parse(res.json());
    expect(parsed.tickets.map((t) => t.id)).toEqual([
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9",
      "T10",
    ]);
  });

  it("rejects an unknown set with a 400 ApiError", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({ method: "GET", url: "/tickets?set=bogus" });
    expect(res.statusCode).toBe(400);
    expect(ApiError.safeParse(res.json()).success).toBe(true);
  });

  it("rejects a missing set with a 400 ApiError", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({ method: "GET", url: "/tickets" });
    expect(res.statusCode).toBe(400);
    expect(ApiError.safeParse(res.json()).success).toBe(true);
  });
});

describe("POST /sessions", () => {
  it("accepts a teach session with a workMapId", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mode: "teach", workMapId: "wm_1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ mode: "teach" });
  });

  it("rejects an unknown mode with 400", async () => {
    const app = await buildApp({ env });
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { mode: "nope" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("rate limiting", () => {
  it("returns an ApiError-shaped 429 above the global limit", async () => {
    const app = await buildApp({ env, rateLimitMax: 2 });
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/health" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(429);
    const parsed = ApiError.parse(res.json());
    expect(parsed.code).toBe("rate_limited");
  });
});
