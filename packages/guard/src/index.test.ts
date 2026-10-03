import type { Outcome, Ticket } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { loadReferenceRules, loadTickets } from "./fixtures.js";
import { evaluate } from "./index.js";

const tickets = loadTickets();
const rules = loadReferenceRules();
const byId = (id: string): Ticket => {
  const t = tickets.find((x) => x.id === id);
  if (!t) throw new Error(`missing ticket ${id}`);
  return t;
};
const act = (id: string, outcome: Outcome) => {
  const { label: _label, ...ticket } = byId(id);
  return evaluate({ ticket, outcome }, rules);
};

describe("guard: the demo-critical cases", () => {
  it("N1: blocks a refund when the card was used without permission (the judged catch)", () => {
    const v = act("N1", "refund");
    expect(v.decision).toBe("BLOCK");
    expect(v.ruleIds).toContain("G4");
    expect(v.expectedOutcome).toBe("handoff_security");
  });

  it("T3: never refunds with an open chargeback", () => {
    const v = act("T3", "refund");
    expect(v.decision).toBe("BLOCK");
    expect(v.ruleIds).toEqual(["G2", "G1"]);
  });

  it("allows the correct outcome on every labelled ticket", () => {
    for (const t of tickets) {
      if (!t.label) continue;
      const v = act(t.id, t.label.outcome);
      expect(["ALLOW", "REQUIRE_APPROVAL"], `${t.id}`).toContain(v.decision);
    }
  });

  it("does not fire on plain happy-path tickets", () => {
    expect(act("T1", "reply").decision).toBe("ALLOW");
    expect(act("T2", "refund").decision).toBe("ALLOW");
  });

  it("requires approval for large clean refunds", () => {
    expect(act("H3", "refund").decision).toBe("REQUIRE_APPROVAL");
  });
});
