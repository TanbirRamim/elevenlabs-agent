import type { GuardVerdict, Outcome } from "@shadow/schema";
import { Badge, Button } from "../ui";

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

const GROUPS: { label: string; outcomes: Outcome[] }[] = [
  { label: "Resolve", outcomes: ["reply", "refund", "hold_request_info"] },
  { label: "Escalate", outcomes: ["escalate_tier2", "escalate_engineering"] },
  {
    label: "Hand off",
    outcomes: ["handoff_security", "handoff_legal", "handoff_billing_disputes"],
  },
  { label: "Finish", outcomes: ["close"] },
];

// DeskSim is read by the vision model, so its controls never animate: no transitions, no press shift.
const STILL = "transition-none! active:translate-y-0! px-4!";

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
    <div className="flex flex-col gap-5">
      {phase.kind === "blocked" ? (
        <div
          role="status"
          className="flex flex-col gap-1.5 rounded-panel border border-signal bg-signal-wash px-5 py-4 shadow-[inset_6px_0_0_var(--desk-signal)] sm:px-6"
        >
          <p className="font-display text-[1.75rem] leading-tight text-ink">Paused by Shadow</p>
          <p className="text-lg leading-snug text-ink">
            {ACTION_LABELS[phase.outcome]} was not saved. Pick another action to continue.
          </p>
          {phase.verdict.ruleIds.length > 0 ? (
            <p className="font-mono text-[0.9375rem] text-signal-text">
              Guardrail rule {phase.verdict.ruleIds.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-8 gap-y-5">
        {GROUPS.map((group) => (
          <fieldset key={group.label} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">{group.label}</legend>
            <div className="flex flex-col gap-2">
              <p aria-hidden="true" className="text-[0.9375rem] leading-6 text-ink-muted">
                {group.label}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {group.outcomes.map((outcome) =>
                  outcome === "refund" ? (
                    <div key={outcome} className="contents">
                      <Button
                        variant="secondary"
                        size="lg"
                        disabled={disabled}
                        onClick={() => onAction(outcome)}
                        className={`${STILL} text-[1.0625rem]!`}
                      >
                        {ACTION_LABELS[outcome]}
                      </Button>
                      <label className="flex items-center gap-2 pr-2">
                        <span className="text-[0.9375rem] text-ink-muted">Refund amount (€)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={refundAmount}
                          disabled={disabled}
                          onChange={(e) => onRefundAmountChange(e.target.value)}
                          onFocus={onRefundFocus}
                          onBlur={onRefundBlur}
                          className="min-h-12 w-28 rounded-control border border-rule-strong bg-surface px-3 text-[1.0625rem] tabular-nums text-ink disabled:opacity-45"
                        />
                      </label>
                    </div>
                  ) : (
                    <Button
                      key={outcome}
                      variant="secondary"
                      size="lg"
                      disabled={disabled}
                      onClick={() => onAction(outcome)}
                      className={`${STILL} text-[1.0625rem]!`}
                    >
                      {ACTION_LABELS[outcome]}
                    </Button>
                  ),
                )}
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      <p
        className="flex min-h-12 flex-wrap items-center gap-3 border-t border-rule pt-4 text-lg empty:min-h-0 empty:border-0 empty:pt-0"
        aria-live="polite"
      >
        {phase.kind === "checking" ? (
          <span className="flex items-center gap-2.5 font-semibold text-ink">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-signal" />
            Checking…
            <span className="font-normal text-ink-muted">
              Shadow is reviewing {ACTION_LABELS[phase.outcome]}
            </span>
          </span>
        ) : null}
        {committed ? (
          <>
            <span className="flex items-center gap-2.5 font-semibold text-ok">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-ok" />
              Committed: {ACTION_LABELS[committed.outcome]}
            </span>
            {committed.approvalRequested ? (
              <Badge tone="signal" dot className="px-3! py-1! text-[0.9375rem]! font-semibold">
                Approval requested
              </Badge>
            ) : null}
          </>
        ) : null}
        {phase.kind === "idle" && !committed ? (
          <span className="text-ink-faint">No action saved on this ticket yet.</span>
        ) : null}
      </p>
    </div>
  );
}
