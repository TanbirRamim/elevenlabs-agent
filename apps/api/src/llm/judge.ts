import { guardJudge } from "@shadow/prompts";
import { type Guardrail, GuardVerdict, Outcome, type PendingAction } from "@shadow/schema";
import { z } from "zod";
import { type LlmDeps, structured } from "./structured.js";

/** Outcomes where a machine-rule ALLOW still gets a second opinion (§6.8). */
export const JUDGED_OUTCOMES: readonly Outcome[] = ["refund", "reply", "close"];

const JudgeOutput = z.object({
  decision: z.enum(["ALLOW", "BLOCK", "REQUIRE_APPROVAL", "WARN"]),
  ruleIds: z.array(z.string()),
  expectedOutcome: Outcome.optional(),
});

export interface JudgeDeps {
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
  { timeoutMs = 2500, decide, log }: JudgeDeps = {},
): Promise<GuardVerdict | null> {
  const decideFn =
    decide ??
    ((a: PendingAction, g: Guardrail[]) =>
      structured(llm, guardJudge, JudgeOutput, [
        {
          type: "text",
          text: JSON.stringify({
            action: { ticket: a.ticket, outcome: a.outcome, amountEur: a.amountEur },
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
    log?.warn({ err: String(err), ticket: action.ticket.id }, "guard judge failed, allowing");
    return GuardVerdict.parse({ decision: "ALLOW", ruleIds: [], source: "timeout_allow" });
  }
  if (result === "timeout") {
    log?.warn({ ticket: action.ticket.id, timeoutMs }, "guard judge timed out, allowing");
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
