import { loadTickets } from "@shadow/guard/fixtures";
import { PublicTicket } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { gapsForDecision, priorityOf, recencyOf, surpriseOf } from "./ledger.js";
import { unseenCaseProbes } from "./probes.js";

const byId = new Map(loadTickets().map((t) => [t.id, PublicTicket.parse(t)]));
let n = 0;
const nextId = () => `gap_${++n}`;

describe("priority formula (§6.5)", () => {
  it("the T3 decision yields a guardrail-slot gap with priority >= 0.6", () => {
    const gaps = gapsForDecision(byId.get("T3"), "T3", "handoff_billing_disputes", 10_000, nextId);
    const guardrail = gaps.find((g) => g.slot === "guardrail");
    expect(guardrail).toBeDefined();
    if (!guardrail) throw new Error("unreachable");
    // amountEur 240 and outcome != refund -> surprise 1.0; fresh -> recency 1
    expect(guardrail.surprise).toBe(1);
    expect(priorityOf(guardrail, { nowMs: 10_000, screenAnswers: [] })).toBeGreaterThanOrEqual(0.6);
  });

  it("a gap whose answer is on screen scores 0", () => {
    const gaps = gapsForDecision(byId.get("T3"), "T3", "handoff_billing_disputes", 0, nextId);
    const guardrail = gaps.find((g) => g.slot === "guardrail");
    if (!guardrail) throw new Error("missing guardrail gap");
    const screenAnswers = ["T3 banner: never refund while a chargeback is open"];
    expect(priorityOf(guardrail, { nowMs: 0, screenAnswers })).toBe(0);
  });

  it("decays linearly to 0 over 60 s", () => {
    const gaps = gapsForDecision(byId.get("T3"), "T3", "handoff_billing_disputes", 0, nextId);
    const g = gaps.find((x) => x.slot === "guardrail");
    if (!g) throw new Error("missing");
    expect(recencyOf(g, 30_000)).toBeCloseTo(0.5);
    expect(recencyOf(g, 60_000)).toBe(0);
    expect(recencyOf(g, 90_000)).toBe(0);
  });

  it("unsurprising decisions halve the priority", () => {
    // T1: no money in play, reply is the naive outcome
    const gaps = gapsForDecision(byId.get("T1"), "T1", "reply", 0, nextId);
    const g = gaps.find((x) => x.slot === "guardrail");
    if (!g) throw new Error("missing");
    expect(surpriseOf(byId.get("T1"), "reply")).toBe(0.5);
    expect(priorityOf(g, { nowMs: 0, screenAnswers: [] })).toBe(0.5);
  });

  it("handoffs open an escalation_contact gap", () => {
    const gaps = gapsForDecision(byId.get("T4"), "T4", "handoff_security", 0, nextId);
    expect(gaps.map((g) => g.slot)).toContain("escalation_contact");
    const reply = gapsForDecision(byId.get("T1"), "T1", "reply", 0, nextId);
    expect(reply.map((g) => g.slot)).not.toContain("escalation_contact");
  });
});

describe("unseenCaseProbes", () => {
  it("includes a security/fraud probe when no security handoff was observed", () => {
    const probes = unseenCaseProbes(["reply", "refund", "handoff_billing_disputes"]);
    expect(probes.some((p) => /fraud|hacked/i.test(p.text))).toBe(true);
    expect(probes.length).toBeLessThanOrEqual(3);
  });

  it("drops probes whose outcome was observed", () => {
    const probes = unseenCaseProbes(["handoff_security", "handoff_legal", "escalate_engineering"]);
    expect(probes).toEqual([]);
  });
});
