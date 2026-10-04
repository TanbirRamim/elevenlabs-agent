import { describe, expect, it } from "vitest";
import { createMetrics, matchesDomAction, p90 } from "./metrics.js";

describe("p90", () => {
  it("returns null with no samples", () => {
    expect(p90([])).toBeNull();
  });
  it("picks the 90th percentile sample", () => {
    expect(p90([100])).toBe(100);
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(p90([1000, 100, 10])).toBe(1000);
  });
});

describe("matchesDomAction", () => {
  const dom = { tMs: 10_000, ticketId: "T3", outcome: "handoff_billing_disputes" as const };
  it("matches same ticket + outcome keyword within 5 s", () => {
    expect(
      matchesDomAction(dom, { tMs: 12_000, text: "ticket T3 moved to Billing disputes handoff" }),
    ).toBe(true);
  });
  it("rejects outside the 5 s window", () => {
    expect(matchesDomAction(dom, { tMs: 16_000, text: "ticket T3 billing dispute" })).toBe(false);
  });
  it("rejects a different ticket or outcome", () => {
    expect(matchesDomAction(dom, { tMs: 10_000, text: "ticket T2 billing dispute" })).toBe(false);
    expect(matchesDomAction(dom, { tMs: 10_000, text: "ticket T3 refunded 240" })).toBe(false);
  });
});

describe("createMetrics agreement", () => {
  it("is null before any DOM action, then matched/total", () => {
    const m = createMetrics();
    expect(m.agreement()).toBeNull();
    m.recordDomAction({ tMs: 1000, ticketId: "T1", outcome: "reply" });
    m.recordDomAction({ tMs: 20_000, ticketId: "T3", outcome: "handoff_billing_disputes" });
    m.recordVisionAction({ tMs: 2000, text: "ticket T1 agent clicked Reply" });
    expect(m.agreement()).toBe(0.5);
    m.recordVisionAction({ tMs: 21_000, text: "ticket T3 handoff to billing disputes" });
    expect(m.agreement()).toBe(1);
  });
  it("tracks unreadable count and latency p90", () => {
    const m = createMetrics();
    m.recordUnreadable();
    m.recordUnreadable();
    expect(m.unreadableCount()).toBe(2);
    expect(m.latencyP90()).toBeNull();
    m.recordLatency(1200);
    expect(m.latencyP90()).toBe(1200);
  });
});
