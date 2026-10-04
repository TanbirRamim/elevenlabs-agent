import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import { loadMockFixtures } from "../mock/fixtures.js";
import { createMemoryStore } from "../store/memory.js";

const env = loadEnv({ NODE_ENV: "test" });

// The mock workmap fixture is a convenient valid WorkMap to seed the store with.
const sampleMap = () => loadMockFixtures().workMap;

async function setup() {
  const store = createMemoryStore();
  store.saveWorkMap(sampleMap());
  const app = await buildApp({ env, store });
  return { app, store };
}

describe("workmap routes", () => {
  it("serves a draft and 404s unknown ids", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/workmaps/wm_mock_1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/workmaps/wm_nope" })).statusCode).toBe(404);
  });

  it("PATCH deletes a guardrail, filters references, bumps version", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "PATCH",
      url: "/workmaps/wm_mock_1",
      payload: { deleteGuardrailIds: ["G1"] },
    });
    expect(res.statusCode).toBe(200);
    const map = res.json<{
      version: number;
      guardrails: { id: string }[];
      steps: { guardrailIds: string[] }[];
    }>();
    expect(map.version).toBe(2);
    expect(map.guardrails.map((g) => g.id)).not.toContain("G1");
    for (const s of map.steps) expect(s.guardrailIds).not.toContain("G1");
  });

  it("PATCH refuses to delete every step", async () => {
    const { app } = await setup();
    const allSteps = sampleMap().steps.map((s) => s.id);
    const res = await app.inject({
      method: "PATCH",
      url: "/workmaps/wm_mock_1",
      payload: { deleteStepIds: allSteps },
    });
    expect(res.statusCode).toBe(400);
  });

  it("publish makes the map available at /workmaps/published", async () => {
    const { app } = await setup();
    const nothing = await app.inject({ method: "GET", url: "/workmaps/published" });
    expect(nothing.statusCode).toBe(404);
    const pub = await app.inject({ method: "POST", url: "/workmaps/wm_mock_1/publish" });
    expect(pub.json()).toEqual({ id: "wm_mock_1" });
    const now = await app.inject({ method: "GET", url: "/workmaps/published" });
    expect(now.statusCode).toBe(200);
  });

  it("markdown renders every guardrail with its quote and the ask-a-senior rule", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/workmaps/wm_mock_1/markdown" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    const md = res.body;
    for (const g of sampleMap().guardrails) {
      expect(md).toContain(`[${g.id}]`);
      expect(md).toContain(g.evidence.quote.text);
    }
    expect(md).toContain("ask a senior colleague");
  });

  it("predictions derive two variants with distinct outcomes from machine rules", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "POST", url: "/workmaps/wm_mock_1/predictions" });
    expect(res.statusCode).toBe(200);
    const { variants } = res.json<{
      variants: { predictedOutcome: string; becauseStepId: string }[];
    }>();
    expect(variants.length).toBe(2);
    expect(new Set(variants.map((v) => v.predictedOutcome)).size).toBe(2);
    const stepIds = new Set(sampleMap().steps.map((s) => s.id));
    for (const v of variants) expect(stepIds.has(v.becauseStepId)).toBe(true);
  });
});
