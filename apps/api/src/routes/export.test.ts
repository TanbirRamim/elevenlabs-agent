import { loadReferenceRules, loadTickets } from "@shadow/guard/fixtures";
import { AgentExport, CopilotRun, WorkMap } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";
import type { LlmDeps } from "../llm/structured.js";
import { loadMockFixtures } from "../mock/fixtures.js";
import { createMemoryStore } from "../store/memory.js";
import { buildAgentExport, runCopilot } from "./export.js";

const fixtureMap = WorkMap.parse(loadMockFixtures().workMap);
const tickets = loadTickets();
const heldOut = tickets.filter((t) => t.label?.set === "held_out");
const fakeLlm = { client: {}, model: "test" } as unknown as LlmDeps;

/** The fixture map with every reference guardrail (the answer key) as machine rules. */
function answerKeyMap(): WorkMap {
  const evidence = fixtureMap.guardrails[0]?.evidence;
  if (!evidence) throw new Error("fixture map has no guardrails");
  return WorkMap.parse({
    ...fixtureMap,
    id: "wm_answer_key",
    guardrails: loadReferenceRules().map((r) => {
      const known = fixtureMap.guardrails.find((g) => g.id === r.id);
      return {
        ...(known ?? {
          id: r.id,
          type: "never",
          condition: `reference rule ${r.id}`,
          action: "follow the reference rule",
          evidence,
        }),
        machineRule: r.machineRule,
      };
    }),
  });
}

describe("agent export", () => {
  it("lists steps in order, guardrails as hard rules and the hand-off conditions", () => {
    const out = buildAgentExport(fixtureMap);
    const p = out.systemPrompt;
    const positions = fixtureMap.steps.map((s) => p.indexOf(s.title));
    expect(positions.every((i) => i >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const g of fixtureMap.guardrails) expect(p).toContain(`[${g.id},`);
    expect(p).toContain("Stop and hand to a human when:");
    const stopAndAsk = fixtureMap.guardrails.filter((g) => g.type === "stop_and_ask");
    for (const g of stopAndAsk) expect(p).toContain(`${g.condition} (${g.id})`);
    expect(out.rules.machine.map((r) => r.id)).toEqual(
      fixtureMap.guardrails.filter((g) => g.machineRule).map((g) => g.id),
    );
    expect(out.rules.guardrails).toHaveLength(fixtureMap.guardrails.length);
  });
});

describe("runCopilot", () => {
  it("covers the held-out tickets; with the full answer key only unroutable outcomes differ", async () => {
    const run = await runCopilot(answerKeyMap(), tickets, { llm: null });
    expect(run.tickets.map((t) => t.ticketId)).toEqual(heldOut.map((t) => t.id));
    // Outcomes no machine rule can produce stay disagreements (honest, not tuned away).
    for (const t of run.tickets.filter((r) => !r.agrees)) {
      expect(["reply", "refund"]).toContain(t.decision);
    }
    const agreed = run.tickets.filter((t) => t.agrees).length;
    expect(run.agreement).toEqual({
      agreed,
      total: heldOut.length,
      rate: agreed / heldOut.length,
    });
    expect(run.judge).toBe("unavailable");
  });

  it("hands blocks, approvals and stop-and-ask rules to a human and cites the rule", async () => {
    const run = await runCopilot(fixtureMap, tickets, { llm: null });
    for (const r of run.tickets) {
      if (r.verdict === "BLOCK" || r.verdict === "REQUIRE_APPROVAL") {
        expect(r.handedToHuman).toBe(true);
        expect(r.citedGuardrailIds.length).toBeGreaterThan(0);
      }
      if (r.verdict === "ALLOW") {
        expect(r.citedGuardrailIds).toEqual([]);
        expect(r.decision).toBe(r.proposed);
      }
      expect(r.source).toBe("machine_rule");
    }
    expect(run.handedToHuman).toBe(run.tickets.filter((t) => t.handedToHuman).length);
  });

  it("runs the same judge as the pre-save guard when a key is set", async () => {
    const decide = vi.fn(async () => ({ decision: "ALLOW" as const, ruleIds: [] }));
    const run = await runCopilot(fixtureMap, tickets, {
      llm: fakeLlm,
      judge: { decide, log: { warn: vi.fn() } },
    });
    expect(run.judge).toBe("on");
    expect(decide).toHaveBeenCalled();
  });
});

describe("export routes", () => {
  const mockEnv = loadEnv({ NODE_ENV: "test", MOCK_AI: "1" });

  it("exports the fixture map in MOCK_AI mode, by id and as 'published'", async () => {
    const app = await buildApp({ env: mockEnv, storage: null });
    for (const id of [fixtureMap.id, "published"]) {
      const res = await app.inject({ method: "GET", url: `/workmaps/${id}/export?format=agent` });
      expect(res.statusCode).toBe(200);
      const body = AgentExport.parse(res.json());
      expect(body.workMapId).toBe(fixtureMap.id);
      expect(body.systemPrompt).toContain(fixtureMap.workflow);
      expect(body.rules.machine.length).toBeGreaterThan(0);
    }
  });

  it("rejects other formats, unknown maps and bad bodies", async () => {
    const app = await buildApp({ env: mockEnv, storage: null });
    const bad = await app.inject({
      method: "GET",
      url: `/workmaps/${fixtureMap.id}/export?format=pdf`,
    });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({
      method: "GET",
      url: "/workmaps/wm_nope/export?format=agent",
    });
    expect(missing.statusCode).toBe(404);
    const run = await app.inject({
      method: "POST",
      url: "/copilot/run",
      payload: { workMapId: "wm_nope" },
    });
    expect(run.statusCode).toBe(404);
    const invalid = await app.inject({ method: "POST", url: "/copilot/run", payload: {} });
    expect(invalid.statusCode).toBe(400);
  });

  it("runs the published map over the 10 held-out tickets", async () => {
    const store = createMemoryStore();
    store.publishWorkMap(fixtureMap);
    const app = await buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      store,
      storage: null,
      llm: null,
    });
    const res = await app.inject({
      method: "POST",
      url: "/copilot/run",
      payload: { workMapId: fixtureMap.id },
    });
    expect(res.statusCode).toBe(200);
    const run = CopilotRun.parse(res.json());
    expect(run.tickets).toHaveLength(10);
    expect(run.agreement.total).toBe(10);
    for (const t of run.tickets) {
      const label = heldOut.find((h) => h.id === t.ticketId)?.label;
      expect(t.expected).toBe(label?.outcome);
      expect(t.agrees).toBe(t.decision === label?.outcome);
    }
  });
});
