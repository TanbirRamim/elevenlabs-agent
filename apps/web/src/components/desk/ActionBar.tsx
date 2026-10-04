import type { GuardVerdict, Outcome } from "@shadow/schema";

/** 1:1 with Outcome; `satisfies` makes the mapping a typecheck guarantee. */
export const ACTION_LABELS = {
  reply: "Reply",
  refund: "Refund",
  hold_request_info: "Hold / request info",
  escalate_tier2: "Escalate: Tier 2",
  escalate_engineering: "Escalate: Engineering",
  handoff_security: "Handoff: Security",
  handoff_legal: "Handoff: Legal",
  handoff_billing_disputes: "Handoff: Billing disputes",
  close: "Close",
} satisfies Record<Outcome, string>;

export interface CommittedAction {
  outcome: Outcome;
  approvalRequested: boolean;
}

export type CommitPhase =
  | { kind: "idle" }
  | { kind: "checking"; outcome: Outcome }
  | { kind: "blocked"; outcome: Outcome; verdict: GuardVerdict }
  | { kind: "committed"; outcome: Outcome; approvalRequested: boolean };

interface ActionBarProps {
  phase: CommitPhase;
  committed: CommittedAction | undefined;
  refundAmount: string;
  onRefundAmountChange: (value: string) => void;
  onRefundFocus: () => void;
  onRefundBlur: () => void;
  onAction: (outcome: Outcome) => void;
}

const GROUPS: Outcome[][] = [
  ["reply", "refund", "hold_request_info"],
  ["escalate_tier2", "escalate_engineering"],
  ["handoff_security", "handoff_legal", "handoff_billing_disputes"],
  ["close"],
];

export function ActionBar({
  phase,
  committed,
  refundAmount,
  onRefundAmountChange,
  onRefundFocus,
  onRefundBlur,
  onAction,
}: ActionBarProps) {
  const disabled = phase.kind === "checking" || committed !== undefined;

  return (
    <div className="flex flex-col gap-3 border-t-2 border-neutral-300 pt-4">
      {phase.kind === "blocked" ? (
        <div
          role="status"
          className="rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-lg font-bold text-red-800"
        >
          Paused by Shadow
          <span className="ml-2 font-normal">
            — pick another action to continue
            {phase.verdict.ruleIds.length > 0 ? ` (rule ${phase.verdict.ruleIds.join(", ")})` : ""}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {GROUPS.map((group) => (
          <div key={group[0]} className="flex flex-wrap items-center gap-2">
            {group.map((outcome) => (
              <button
                key={outcome}
                type="button"
                disabled={disabled}
                onClick={() => onAction(outcome)}
                className="rounded border-2 border-neutral-800 bg-white px-4 py-2 text-lg font-semibold text-neutral-900 enabled:hover:bg-neutral-100 disabled:border-neutral-300 disabled:text-neutral-400"
              >
                {ACTION_LABELS[outcome]}
              </button>
            ))}
            {group.includes("refund") ? (
              <label className="flex items-center gap-2 text-lg">
                <span className="font-semibold">Refund amount (€)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={refundAmount}
                  disabled={disabled}
                  onChange={(e) => onRefundAmountChange(e.target.value)}
                  onFocus={onRefundFocus}
                  onBlur={onRefundBlur}
                  className="w-28 rounded border-2 border-neutral-800 px-2 py-1.5 text-lg disabled:border-neutral-300 disabled:text-neutral-400"
                />
              </label>
            ) : null}
          </div>
        ))}
      </div>

      <p className="min-h-7 text-lg" aria-live="polite">
        {phase.kind === "checking" ? <span className="font-semibold">Checking…</span> : null}
        {committed ? (
          <span className="font-semibold text-green-800">
            Committed: {ACTION_LABELS[committed.outcome]}
            {committed.approvalRequested ? (
              <span className="ml-2 rounded bg-amber-200 px-2 py-0.5 text-base text-amber-900">
                Approval requested
              </span>
            ) : null}
          </span>
        ) : null}
      </p>
    </div>
  );
}
