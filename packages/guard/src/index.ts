import type { GuardVerdict, MachineRule, PendingAction } from "@shadow/schema";

export interface RuleRef {
  id: string;
  machineRule: MachineRule;
}

const SEVERITY = { BLOCK: 3, REQUIRE_APPROVAL: 2, WARN: 1 } as const;

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
