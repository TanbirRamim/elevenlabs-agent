import { describe, expect, it } from "vitest";
import { loadMockFixtures } from "./fixtures.js";

describe("mock fixtures", () => {
  it("every fixture parses against its schema", () => {
    // The loader parses each file with its schema; an invalid fixture throws here.
    expect(() => loadMockFixtures()).not.toThrow();
  });

  it("T3 and T4 carry guardrail-slot questions", () => {
    const { questions } = loadMockFixtures();
    expect(questions.T3?.slot).toBe("guardrail");
    expect(questions.T4?.slot).toBe("guardrail");
    expect(questions.T3?.priority).toBeGreaterThanOrEqual(0.6);
    expect(questions.T4?.priority).toBeGreaterThanOrEqual(0.6);
  });

  it("cross-fixture ids resolve", () => {
    const { endSession, workMap, mastery } = loadMockFixtures();
    expect(endSession.workMapId).toBe(workMap.id);
    expect(mastery.workMapId).toBe(workMap.id);
    const knownIds = new Set([
      ...workMap.guardrails.map((g) => g.id),
      ...workMap.steps.map((s) => s.id),
    ]);
    for (const entry of mastery.entries) {
      expect(knownIds.has(entry.stepOrGuardrailId), entry.stepOrGuardrailId).toBe(true);
    }
    for (const id of mastery.practiceNext) {
      expect(knownIds.has(id), id).toBe(true);
    }
  });
});
