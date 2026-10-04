import { evaluate, type RuleRef, rulesFromWorkMap } from "@shadow/guard";
import { guardJudge } from "@shadow/prompts";
import {
  type Guardrail,
  GuardVerdict,
  Outcome,
  type PendingAction,
  type WorkMap,
} from "@shadow/schema";
import { z } from "zod";
import { type LlmDeps, structured } from "./structured.js";

/** Outcomes where a machine verdict short of BLOCK still gets a second opinion (§6.8). */
export const JUDGED_OUTCOMES: readonly Outcome[] = ["refund", "reply", "close"];

const JudgeOutput = z.object({
  decision: z.enum(["ALLOW", "BLOCK", "REQUIRE_APPROVAL", "WARN"]),
  ruleIds: z.array(z.string()),
  expectedOutcome: Outcome.optional(),
});

function customerFacts({ plan, vip, accountAgeDays }: PendingAction["ticket"]["customer"]) {
  return { plan, vip, accountAgeDays };
}

export interface JudgeDeps {
  /**
   * The live judge call measures ~3 s on claude-opus-5-5 (HAR-11 PR #62), so the
   * §6.8 figure of 2.5 s would silently degrade the N1 BLOCK to timeout_allow.
   * 6 s keeps the demo's climax dependable; the UI shows "Checking…" meanwhile.
   */
  timeoutMs?: number;
  /** Test seam; defaults to the guardJudge route. */
  decide?: (action: PendingAction, guardrails: Guardrail[]) => Promise<z.infer<typeof JudgeOutput>>;
  log?: { warn: (obj: object, msg: string) => void };
}

/**
 * LLM second opinion against the published map's guardrails (including the
 * ones without a machine rule — that is the point). Returns null when the
 * judge agrees with ALLOW or its verdict cites unknown guardrail ids (never
 * invent rules); a timeout returns an explicit timeout_allow verdict.
 */
export async function judgeAction(
  llm: LlmDeps,
  action: PendingAction,
  guardrails: Guardrail[],
  { timeoutMs = 6000, decide, log }: JudgeDeps = {},
): Promise<GuardVerdict | null> {
  const decideFn =
    decide ??
    ((a: PendingAction, g: Guardrail[]) =>
      structured(llm, guardJudge, JudgeOutput, [
        {
          type: "text",
          text: JSON.stringify({
            action: {
              // The case, not the person: no customer name or email leaves for the judge.
              ticket: { ...a.ticket, customer: customerFacts(a.ticket.customer) },
              outcome: a.outcome,
              amountEur: a.amountEur,
            },
            guardrails: g.map(({ id, type, condition, action: gAction }) => ({
              id,
              type,
              condition,
              action: gAction,
            })),
          }),
        },
      ]));

  const timeout = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), timeoutMs).unref?.();
  });
  let result: z.infer<typeof JudgeOutput> | "timeout";
  try {
    result = await Promise.race([decideFn(action, guardrails), timeout]);
  } catch (err) {
    log?.warn(
      { err: String(err), ticket: action.ticket.id },
      "guard judge failed; save not checked by the judge",
    );
    return GuardVerdict.parse({ decision: "ALLOW", ruleIds: [], source: "timeout_allow" });
  }
  if (result === "timeout") {
    log?.warn(
      { ticket: action.ticket.id, timeoutMs },
      "guard judge timed out; save not checked by the judge",
    );
    return GuardVerdict.parse({ decision: "ALLOW", ruleIds: [], source: "timeout_allow" });
  }
  if (result.decision === "ALLOW") return null; // machine verdict stands
  const known = new Set(guardrails.map((g) => g.id));
  if (result.ruleIds.length === 0 || !result.ruleIds.every((id) => known.has(id))) {
    log?.warn(
      { ticket: action.ticket.id, ruleIds: result.ruleIds },
      "guard judge cited unknown rules, verdict discarded",
    );
    return null;
  }
  return GuardVerdict.parse({ ...result, source: "llm_judge" });
}

const RANK = { ALLOW: 0, WARN: 1, REQUIRE_APPROVAL: 2, BLOCK: 3 } as const;

/**
 * Folds the judge's verdict (null: no usable answer) into the machine verdict. The judge can
 * only make it stricter: N1's G1 REQUIRE_APPROVAL becomes a BLOCK when the judge cites the
 * unmechanized fraud guardrail, but a judge ALLOW/WARN or a timeout never loosens a machine
 * REQUIRE_APPROVAL or WARN. timeout_allow is only ever returned for a machine ALLOW.
 */
export function escalate(machine: GuardVerdict, judged: GuardVerdict | null): GuardVerdict {
  if (!judged) return machine;
  if (machine.decision === "ALLOW") return judged;
  if (judged.source === "timeout_allow" || RANK[judged.decision] <= RANK[machine.decision]) {
    return machine;
  }
  // The judge's rules lead (the UI quotes ruleIds[0]); the machine rules that fired follow.
  const expectedOutcome = judged.expectedOutcome ?? machine.expectedOutcome;
  return {
    ...judged,
    ruleIds: [...judged.ruleIds, ...machine.ruleIds.filter((id) => !judged.ruleIds.includes(id))],
    ...(expectedOutcome ? { expectedOutcome } : {}),
  };
}

export interface RunGuardDeps {
  /** The map the action is checked against; undefined: the fallback rules only, no judge. */
  map: WorkMap | undefined;
  fallbackRules: readonly RuleRef[];
  /** null: no key, machine rules only. */
  llm: LlmDeps | null;
  judge?: JudgeDeps;
}

/**
 * The full pre-save check (§6.8): the map's machine rules, then — for a risky outcome the rules
 * did not BLOCK — the judge against all of the map's guardrails, folded in by `escalate`.
 * Shared by /guard/presave, /copilot/run and `pnpm eval:tutor`, so all three agree.
 */
export async function runGuard(
  action: PendingAction,
  { map, fallbackRules, llm, judge }: RunGuardDeps,
): Promise<GuardVerdict> {
  const machine = evaluate(action, map ? rulesFromWorkMap(map) : fallbackRules);
  if (
    machine.decision === "BLOCK" ||
    !JUDGED_OUTCOMES.includes(action.outcome) ||
    !llm ||
    !map ||
    map.guardrails.length === 0
  ) {
    return machine;
  }
  return escalate(machine, await judgeAction(llm, action, map.guardrails, judge));
}
