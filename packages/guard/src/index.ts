import type { GuardVerdict, MachineRule, PendingAction, WorkMap } from "@shadow/schema";

export interface RuleRef {
  id: string;
  machineRule: MachineRule;
}

/** Effect ranking: the most severe fired rule decides the verdict. */
export const SEVERITY = { BLOCK: 3, REQUIRE_APPROVAL: 2, WARN: 1 } as const;

/** The machine rules a Work Map carries. Guardrails without a machineRule are left to the judge. */
export function rulesFromWorkMap(map: Pick<WorkMap, "guardrails">): RuleRef[] {
  return map.guardrails.flatMap((g) =>
    g.machineRule ? [{ id: g.id, machineRule: g.machineRule }] : [],
  );
}

/**
 * True when the ticket's own content (tags, text, amount, VIP) meets the rule's conditions,
 * whatever action is taken. Rules without a tag or phrase condition (e.g. "any refund over
 * 100") are about the action, not the ticket, so they never mark a ticket as a judgment point.
 */
export function matchesTicket(rule: MachineRule, ticket: PendingAction["ticket"]): boolean {
  const { when } = rule;
  if (!when.anyTag?.length && !when.bodyMatchesAny?.length) return false;
  const { action: _action, ...content } = when;
  return matches({ when: content, effect: rule.effect }, { ticket, outcome: "reply" });
}

/** True when every condition present in `rule.when` holds for this pending action. */
export function matches(rule: MachineRule, action: PendingAction): boolean {
  const { when } = rule;
  const text = `${action.ticket.subject}\n${action.ticket.body}`.toLowerCase();
  const amount = action.amountEur ?? action.ticket.amountEur;

  if (when.action !== undefined && when.action !== action.outcome) return false;
  if (when.anyTag && !when.anyTag.some((t) => action.ticket.tags.includes(t))) return false;
  if (when.bodyMatchesAny && !when.bodyMatchesAny.some((s) => text.includes(s.toLowerCase()))) {
    return false;
  }
  if (
    when.amountEurAbove !== undefined &&
    !(amount !== undefined && amount > when.amountEurAbove)
  ) {
    return false;
  }
  if (when.vip !== undefined && when.vip !== action.ticket.customer.vip) return false;
  // Taking the outcome the rule asks for is never a violation.
  if (rule.expectedOutcome !== undefined && rule.expectedOutcome === action.outcome) return false;
  return true;
}

/**
 * Deterministic pre-save check. Pure, synchronous, no I/O: safe to run in the browser
 * for instant feedback and again on the server as the source of truth.
 */
export function evaluate(action: PendingAction, rules: readonly RuleRef[]): GuardVerdict {
  const fired = rules.filter((r) => matches(r.machineRule, action));
  if (fired.length === 0) return { decision: "ALLOW", ruleIds: [], source: "machine_rule" };

  const sorted = [...fired].sort(
    (a, b) => SEVERITY[b.machineRule.effect] - SEVERITY[a.machineRule.effect],
  );
  const top = sorted[0];
  if (!top) return { decision: "ALLOW", ruleIds: [], source: "machine_rule" };
  const expected = sorted.find((r) => r.machineRule.expectedOutcome)?.machineRule.expectedOutcome;
  return {
    decision: top.machineRule.effect,
    ruleIds: sorted.map((r) => r.id),
    ...(expected ? { expectedOutcome: expected } : {}),
    source: "machine_rule",
  };
}
