import { readFileSync } from "node:fs";
import { Ticket, WorkMap } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sampleWorkMap } from "./fixture";

const seed = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../../seed/${path}`, import.meta.url), "utf8"));

const ReferenceRules = z.object({
  rules: z.array(
    z.object({ id: z.string(), type: z.string(), condition: z.string(), action: z.string() }),
  ),
});

describe("sample Work Map", () => {
  it("passes the WorkMap contract, including its evidence refinements", () => {
    const parsed = WorkMap.safeParse(sampleWorkMap);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  });

  it("is exactly the map the API serves in MOCK_AI mode (seed/fixtures/workmap.json)", () => {
    expect(sampleWorkMap).toEqual(WorkMap.parse(seed("fixtures/workmap.json")));
  });

  it("gives every guardrail id the meaning it has in the answer key and the ticket labels", () => {
    const reference = new Map(
      ReferenceRules.parse(seed("reference-guardrails.json")).rules.map((r) => [r.id, r]),
    );
    for (const g of sampleWorkMap.guardrails) {
      const ref = reference.get(g.id);
      expect(ref, `${g.id} is not in seed/reference-guardrails.json`).toBeDefined();
      expect({ type: g.type, condition: g.condition, action: g.action }).toEqual({
        type: ref?.type,
        condition: ref?.condition,
        action: ref?.action,
      });
    }
    for (const t of z.array(Ticket).parse(seed("tickets.json"))) {
      for (const id of t.label?.guardrails ?? [])
        expect(reference.has(id), `${t.id} cites ${id}`).toBe(true);
    }
  });

  it("has the shape the page is built around", () => {
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    expect(ids(sampleWorkMap.steps)).toEqual(["S1", "S2", "S3", "S4"]);
    expect(ids(sampleWorkMap.steps.filter((s) => s.judgmentCall))).toEqual(["S4"]);
    expect(ids(sampleWorkMap.guardrails)).toEqual(["G1", "G2", "G3", "G4", "G6"]);
    expect(sampleWorkMap.guardrails.map((g) => g.type).sort()).toEqual([
      "limit",
      "never",
      "never",
      "stop_and_ask",
      "stop_and_ask",
    ]);
    const stepIds = new Set(ids(sampleWorkMap.steps));
    const guardrailIds = new Set(ids(sampleWorkMap.guardrails));
    for (const s of sampleWorkMap.steps) {
      for (const g of s.guardrailIds) expect(guardrailIds.has(g), `${s.id} cites ${g}`).toBe(true);
    }
    for (const q of sampleWorkMap.openQuestions) {
      if (q.aboutStepId) expect(stepIds.has(q.aboutStepId)).toBe(true);
    }
  });

  it("cites only the expert, and never inside an off-the-record span", () => {
    const quotes = [
      ...sampleWorkMap.steps.map((s) => s.reason),
      ...sampleWorkMap.guardrails.map((g) => g.evidence.quote),
    ];
    for (const q of quotes) expect(q.speaker).toBe("expert");
    const moments = [
      ...sampleWorkMap.steps.map((s) => s.moment.tMs),
      ...sampleWorkMap.guardrails.map((g) => g.evidence.moment.tMs),
      ...quotes.map((q) => q.tMs),
    ];
    for (const [start, end] of sampleWorkMap.offRecordSpans) {
      for (const t of moments) expect(t < start || t > end).toBe(true);
    }
  });
});
