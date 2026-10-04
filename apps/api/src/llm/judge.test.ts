import { loadTickets } from "@shadow/guard/fixtures";
import type { Guardrail, PendingAction } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import { loadMockFixtures } from "../mock/fixtures.js";
import { createMemoryStore } from "../store/memory.js";
import { judgeAction } from "./judge.js";
import type { LlmDeps } from "./structured.js";
import { createLlm } from "./structured.js";

const env = loadEnv({ NODE_ENV: "test" });
const fakeLlm = { client: {}, model: "test" } as unknown as LlmDeps;
const log = { warn: vi.fn() };

function n1Action(): PendingAction {
  const n1 = loadTickets().find((t) => t.id === "N1");
  if (!n1) throw new Error("seed missing N1");
  const { label: _label, ...ticket } = n1;
  return { ticket, outcome: "refund", amountEur: n1.amountEur };
}

/** The captured map's fraud guardrail WITHOUT a machine rule — only the judge can catch it. */
function fraudGuardrailNoRule(): Guardrail[] {
  const map = loadMockFixtures().workMap;
  return map.guardrails.map((g) => {
    const { machineRule: _m, ...rest } = g;
    return rest;
  });
}

describe("judgeAction (unit)", () => {
  it("passes a judge BLOCK through with source llm_judge", async () => {
    const verdict = await judgeAction(fakeLlm, n1Action(), fraudGuardrailNoRule(), {
      decide: async () => ({
        decision: "BLOCK",
        ruleIds: ["G3"],
        expectedOutcome: "handoff_security",
      }),
      log,
    });
    expect(verdict).toMatchObject({
      decision: "BLOCK",
      ruleIds: ["G3"],
      expectedOutcome: "handoff_security",
      source: "llm_judge",
    });
  });

  it("discards a verdict citing unknown guardrail ids", async () => {
    const verdict = await judgeAction(fakeLlm, n1Action(), fraudGuardrailNoRule(), {
      decide: async () => ({ decision: "BLOCK", ruleIds: ["G_invented"] }),
      log,
    });
    expect(verdict).toBeNull();
  });

  it("discards a non-ALLOW verdict citing no rules at all", async () => {
    const verdict = await judgeAction(fakeLlm, n1Action(), fraudGuardrailNoRule(), {
      decide: async () => ({ decision: "BLOCK", ruleIds: [] }),
      log,
    });
    expect(verdict).toBeNull();
  });

  it("returns null on judge ALLOW (machine verdict stands)", async () => {
    const verdict = await judgeAction(fakeLlm, n1Action(), fraudGuardrailNoRule(), {
      decide: async () => ({ decision: "ALLOW", ruleIds: [] }),
      log,
    });
    expect(verdict).toBeNull();
  });

  it("times out to an explicit timeout_allow", async () => {
    const verdict = await judgeAction(fakeLlm, n1Action(), fraudGuardrailNoRule(), {
      decide: () => new Promise(() => {}),
      timeoutMs: 20,
      log,
    });
    expect(verdict).toMatchObject({ decision: "ALLOW", source: "timeout_allow" });
  });
});

describe("guard route with judge", () => {
  type Decide = NonNullable<NonNullable<Parameters<typeof judgeAction>[3]>["decide"]>;
  async function appWithPublishedMap(decide: Decide) {
    const store = createMemoryStore();
    const map = loadMockFixtures().workMap;
    // Strip every machine rule: machine evaluation ALLOWs, only the judge can catch.
    store.publishWorkMap({
      ...map,
      guardrails: map.guardrails.map(({ machineRule: _m, ...rest }) => rest),
    });
    const app = await buildApp({
      env,
      store,
      llm: fakeLlm,
      judgeSeams: { decide, log },
    });
    return { app, store };
  }

  it("machine ALLOW + refund goes to the judge; BLOCK comes back", async () => {
    const { app, store } = await appWithPublishedMap(async () => ({
      decision: "BLOCK" as const,
      ruleIds: ["G3"],
      expectedOutcome: "handoff_security" as const,
    }));
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { mode: "teach" },
    });
    const sessionId = created.json<{ id: string }>().id;
    const res = await app.inject({
      method: "POST",
      url: `/guard/presave?sessionId=${sessionId}`,
      payload: n1Action(),
    });
    expect(res.json()).toMatchObject({ decision: "BLOCK", source: "llm_judge" });
    // verdict recorded on the session for mastery
    expect(store.getSession(sessionId)?.guardVerdicts).toMatchObject([
      { ticketId: "N1", outcome: "refund", verdict: { decision: "BLOCK" } },
    ]);
  });

  it("non-judged outcomes never reach the judge", async () => {
    const decide = vi.fn(async () => ({ decision: "BLOCK" as const, ruleIds: ["G3"] }));
    const { app } = await appWithPublishedMap(decide);
    const action = { ...n1Action(), outcome: "handoff_security" as const };
    const res = await app.inject({ method: "POST", url: "/guard/presave", payload: action });
    expect(res.json()).toMatchObject({ decision: "ALLOW", source: "machine_rule" });
    expect(decide).not.toHaveBeenCalled();
  });
});

// The real thing, run locally with the key (CI skips it):
//   ANTHROPIC_API_KEY=... pnpm --filter @shadow/api test
describe.skipIf(!process.env.ANTHROPIC_API_KEY)("guard judge (live Claude)", () => {
  it("catches the N1 wrong refund via llm_judge with no machine rule", async () => {
    const llm = createLlm(
      process.env.ANTHROPIC_API_KEY ?? "",
      process.env.SHADOW_MODEL ?? "claude-opus-5-5",
    );
    const verdict = await judgeAction(llm, n1Action(), fraudGuardrailNoRule(), {
      timeoutMs: 30_000,
      log,
    });
    expect(verdict).not.toBeNull();
    expect(verdict?.decision).toBe("BLOCK");
    expect(verdict?.source).toBe("llm_judge");
  }, 60_000);
});
