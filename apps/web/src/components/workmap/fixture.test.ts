import { WorkMap } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { sampleWorkMap } from "./fixture";

describe("sample Work Map", () => {
  it("passes the WorkMap contract, including its evidence refinements", () => {
    const parsed = WorkMap.safeParse(sampleWorkMap);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  });

  it("has the shape the page is built around", () => {
    expect(sampleWorkMap.steps.length).toBeGreaterThanOrEqual(5);
    expect(sampleWorkMap.steps.length).toBeLessThanOrEqual(7);
    expect(sampleWorkMap.steps.filter((s) => s.judgmentCall)).toHaveLength(3);
    expect(sampleWorkMap.guardrails).toHaveLength(4);
    expect(sampleWorkMap.guardrails.map((g) => g.type).sort()).toEqual([
      "limit",
      "never",
      "stop_and_ask",
      "stop_and_ask",
    ]);
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
