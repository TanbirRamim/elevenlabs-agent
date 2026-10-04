import { readFileSync } from "node:fs";
import { type RuleRef, rulesFromWorkMap } from "@shadow/guard";
import { type MachineRule, PublicTicket, WorkMap } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { REFERENCE_RULES } from "../../lib/connector/referenceRules";
import { buildIntervention, matchJudgment, pickGuidedStart, predictPayload } from "./logic";

/**
 * /teach must work for a real captured Work Map, whose ids look nothing like the sample's
 * G1..G6 / S1..S4. These tests rename every id of the sample map consistently and check the
 * guided start, predict and intervention still work, with no sample id leaking through.
 */

const seed = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../../seed/${path}`, import.meta.url), "utf8"));

const RENAMES: Record<string, string> = {
  G1: "g_refund_limit",
  G2: "g_chargeback",
  G3: "g_takeover",
  G4: "g_fraud",
  G5: "g_vip",
  G6: "g_gdpr",
  G7: "g_outage",
  S1: "s_read",
  S2: "s_refund",
  S3: "s_dispute",
  S4: "s_security",
};

/** The sample map with every guardrail and step id renamed (only exact id strings change). */
function renamedMap(): WorkMap {
  const json = JSON.stringify(seed("fixtures/workmap.json")).replace(
    /"([GS]\d+)"/g,
    (whole, id: string) => (RENAMES[id] ? `"${RENAMES[id]}"` : whole),
  );
  return WorkMap.parse({ ...JSON.parse(json), id: "wm_captured_real" });
}

const tickets = z
  .array(PublicTicket)
  .parse(seed("tickets.json"))
  .filter((t) => /^N\d+$/.test(t.id));

const SAMPLE_ID = /^[GS]\d+$/;

/** What TeachSession's fallbackRules builds: the map's own rules, topped up by reference ids. */
function teachRules(map: WorkMap): RuleRef[] {
  const own = rulesFromWorkMap(map);
  const ids = new Set(own.map((r) => r.id));
  return [...own, ...REFERENCE_RULES.filter((r) => !ids.has(r.id))];
}

describe("/teach with a real (renamed-id) Work Map", () => {
  const map = renamedMap();

  it("renamed every sample id", () => {
    expect(map.guardrails.map((g) => g.id).filter((id) => SAMPLE_ID.test(id))).toEqual([]);
    expect(map.steps.map((s) => s.id).filter((id) => SAMPLE_ID.test(id))).toEqual([]);
    expect(tickets.length).toBeGreaterThan(0);
  });

  it("guided start finds a ticket the loaded rules would hold", () => {
    const pick = pickGuidedStart(tickets, teachRules(map));
    expect(pick).not.toBeNull();
    expect(tickets.map((t) => t.id)).toContain(pick?.ticketId);
  });

  it("guided start from the map's own rules cites the map's own ids", () => {
    const pick = pickGuidedStart(tickets, rulesFromWorkMap(map));
    expect(pick).not.toBeNull();
    expect(map.guardrails.map((g) => g.id)).toContain(pick?.ruleId);
  });

  it("predict fires on the same tickets as the sample map, with the renamed ids", () => {
    const sample = WorkMap.parse(seed("fixtures/workmap.json"));
    let hits = 0;
    for (const ticket of tickets) {
      const before = matchJudgment(sample, ticket);
      const after = matchJudgment(map, ticket);
      expect(after?.guardrail.id ?? null).toBe(
        before ? (RENAMES[before.guardrail.id] ?? null) : null,
      );
      if (after) {
        hits += 1;
        const payload = predictPayload(after, ticket.id);
        expect(payload.guardrailId).not.toMatch(SAMPLE_ID);
        expect(payload.stepId).not.toMatch(SAMPLE_ID);
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("an intervention for a judge BLOCK quotes the expert from the renamed guardrail", () => {
    const ticket = tickets[0];
    if (!ticket) throw new Error("no new-hire tickets in seed");
    const built = buildIntervention(
      map,
      { decision: "BLOCK", ruleIds: ["g_fraud"], source: "llm_judge" },
      ticket.id,
      "refund",
    );
    expect(built.primary?.id).toBe("g_fraud");
    expect(built.payload.quote).toBeTruthy();
    expect(built.payload.frameId).toBeTruthy();
    expect(built.payload.stepId).toBe("s_security");
    expect(built.cited.missing).toEqual([]);
  });
});

describe("pickGuidedStart", () => {
  const rule = (id: string, machineRule: MachineRule): RuleRef => ({ id, machineRule });

  it("prefers a refund on any ticket over another outcome", () => {
    const rules = [
      rule("r_close", { when: { action: "close" }, effect: "BLOCK" }),
      rule("r_refund", { when: { action: "refund", anyTag: ["vip"] }, effect: "BLOCK" }),
    ];
    const vip = tickets.find((t) => t.tags.includes("vip"));
    const pick = pickGuidedStart(tickets, rules);
    if (vip) expect(pick).toEqual({ ticketId: vip.id, outcome: "refund", ruleId: "r_refund" });
    else expect(pick?.outcome).toBe("close");
  });

  it("falls back to another outcome when no refund is held", () => {
    const rules = [rule("r_close", { when: { action: "close" }, effect: "BLOCK" })];
    expect(pickGuidedStart(tickets, rules)).toEqual({
      ticketId: tickets[0]?.id,
      outcome: "close",
      ruleId: "r_close",
    });
  });

  it("ignores rules that only warn or ask for approval, and returns null with nothing to hold", () => {
    const rules = [
      rule("r_warn", { when: { action: "refund" }, effect: "WARN" }),
      rule("r_approve", { when: { action: "refund" }, effect: "REQUIRE_APPROVAL" }),
    ];
    expect(pickGuidedStart(tickets, rules)).toBeNull();
    expect(pickGuidedStart([], REFERENCE_RULES)).toBeNull();
  });
});
