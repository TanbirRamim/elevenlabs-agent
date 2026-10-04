import type { GuardVerdict, Outcome } from "@shadow/schema";
import { CircleCheck, Loader, Pause } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Badge, Button, cx, Kbd } from "../ui";

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
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onReplyFocus: () => void;
  onReplyBlur: () => void;
  onAction: (outcome: Outcome) => void;
  /** Coaching from the host (Teach), anchored under the pause notice. */
  coach?: ReactNode;
}

/** Reply (via the composer) and Refund lead; everything else is a quieter routing decision. */
const PRIMARY: readonly Outcome[] = ["reply", "refund"];
const ROUTE: readonly Outcome[] = [
  "hold_request_info",
  "escalate_tier2",
  "escalate_engineering",
  "handoff_security",
  "handoff_legal",
  "handoff_billing_disputes",
  "close",
];

/** The actions in the order the bar shows them; the 1-9 shortcuts follow this order. */
export const ACTION_ORDER: readonly Outcome[] = [...PRIMARY, ...ROUTE];

/** The shortcut digit for an outcome, as shown on its button. */
export function shortcutFor(outcome: Outcome): string {
  return String(ACTION_ORDER.indexOf(outcome) + 1);
}

// DeskSim is read by the vision model, so its controls never animate: no transitions, no press shift.
const STILL = "transition-none! active:translate-y-0!";

export function ActionBar({
  phase,
  committed,
  refundAmount,
  onRefundAmountChange,
  onRefundFocus,
  onRefundBlur,
  replyDraft,
  onReplyDraftChange,
  onReplyFocus,
  onReplyBlur,
  onAction,
  coach,
}: ActionBarProps) {
  const disabled = phase.kind === "checking" || committed !== undefined;
  const blocked = phase.kind === "blocked" ? phase : null;
  const suggested = blocked?.verdict.expectedOutcome ?? null;
  const suggestedHintId = useId();
  const hasCoach = coach !== undefined && coach !== null && coach !== false;

  const actionButton = (outcome: Outcome, opts: { ghost?: boolean } = {}) => {
    const held = blocked?.outcome === outcome;
    const isSuggested = suggested === outcome && !disabled;
    const primary = outcome === "reply" || isSuggested;
    return (
      <Button
        key={outcome}
        variant={primary ? "primary" : opts.ghost ? "ghost" : "secondary"}
        size={opts.ghost ? "sm" : "md"}
        disabled={disabled}
        onClick={() => onAction(outcome)}
        aria-describedby={isSuggested ? suggestedHintId : undefined}
        aria-keyshortcuts={shortcutFor(outcome)}
        icon={held ? <Pause aria-hidden="true" className="fill-current" /> : undefined}
        trailing={
          <Kbd
            aria-hidden="true"
            className={cx(
              "ml-1 h-4 min-w-4 text-[10px] shadow-none",
              primary && "border-ink-inverse/40! bg-transparent! text-ink-inverse!",
              held && "border-guard/50! bg-transparent! text-guard-text!",
            )}
          >
            {shortcutFor(outcome)}
          </Kbd>
        }
        className={cx(
          STILL,
          opts.ghost && "text-ink-muted",
          held &&
            "border-guard/60 bg-guard-wash text-guard-text hover:border-guard hover:bg-guard-wash",
        )}
      >
        {ACTION_LABELS[outcome]}
      </Button>
    );
  };

  return (
    <section
      aria-label="Actions"
      className="flex flex-col gap-4 border-t border-rule bg-canvas px-4 py-4 @3xl:px-6"
    >
      {blocked || hasCoach ? (
        <div
          className={cx(
            "overflow-hidden rounded-panel border bg-surface",
            blocked ? "border-guard/45" : "border-rule",
          )}
        >
          {blocked ? (
            <div
              role="status"
              className="flex items-start gap-3 border-b border-guard/30 bg-guard-wash px-4 py-2.5 @2xl:items-center"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-guard text-guard-ink"
              >
                <Pause className="size-3.5 fill-current stroke-[2]" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-0.5 @2xl:flex-row @2xl:items-center">
                <p className="min-w-0 flex-1 text-ui text-ink">
                  <span className="font-semibold">Paused by Shadow</span>
                  <span className="text-ink-muted">
                    {" "}
                    · {ACTION_LABELS[blocked.outcome]} was not saved. Pick another action to
                    continue.
                  </span>
                </p>
                {blocked.verdict.ruleIds.length > 0 ? (
                  <p className="font-mono text-xs font-medium text-guard-text">
                    Guardrail rule {blocked.verdict.ruleIds.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {hasCoach ? coach : null}
        </div>
      ) : null}

      {suggested ? (
        <span id={suggestedHintId} className="sr-only">
          Suggested by the guardrail
        </span>
      ) : null}

      {/* The composer leads, like a real helpdesk: write the reply, or settle the money. */}
      <div className="flex flex-col gap-2 rounded-panel border border-rule-strong bg-surface p-2">
        <textarea
          aria-label="Reply to the customer"
          placeholder="Write a reply…"
          rows={2}
          value={replyDraft}
          disabled={disabled}
          onChange={(e) => onReplyDraftChange(e.target.value)}
          onFocus={onReplyFocus}
          onBlur={onReplyBlur}
          className="w-full resize-none border-0 bg-transparent px-1.5 py-1 text-ui text-ink outline-none placeholder:text-ink-faint disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <label className="mr-auto flex items-center">
            <span className="sr-only">Refund amount (€)</span>
            <span
              aria-hidden="true"
              className="flex h-8 items-center rounded-l-control border border-r-0 border-rule-strong bg-sunken px-2 text-ink-faint"
            >
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={refundAmount}
              disabled={disabled}
              onChange={(e) => onRefundAmountChange(e.target.value)}
              onFocus={onRefundFocus}
              onBlur={onRefundBlur}
              className="figures h-8 w-20 rounded-r-control border border-rule-strong bg-surface px-2 text-ui text-ink disabled:opacity-50"
            />
          </label>
          {actionButton("refund")}
          {actionButton("reply")}
        </div>
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1.5 p-0 text-2xs font-medium text-ink-faint">Route ticket</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {ROUTE.map((outcome) => actionButton(outcome, { ghost: true }))}
        </div>
      </fieldset>

      <p
        className="flex min-h-6 flex-wrap items-center gap-2 text-ui empty:hidden"
        aria-live="polite"
      >
        {phase.kind === "checking" ? (
          <span className="flex items-center gap-2 font-medium text-ink">
            <Loader aria-hidden="true" className="size-4 stroke-[1.75] text-ask-text" />
            Checking…
            <span className="font-normal text-ink-muted">
              Shadow is reviewing {ACTION_LABELS[phase.outcome]}
            </span>
          </span>
        ) : null}
        {committed ? (
          <>
            <span className="flex items-center gap-2 font-medium text-ok">
              <CircleCheck aria-hidden="true" className="size-4 stroke-[1.75]" />
              Committed: {ACTION_LABELS[committed.outcome]}
            </span>
            {committed.approvalRequested ? (
              <Badge tone="guard" dot>
                Approval requested
              </Badge>
            ) : null}
          </>
        ) : null}
        {phase.kind === "idle" && !committed ? (
          <span className="text-ink-faint">No action saved on this ticket yet.</span>
        ) : null}
      </p>
    </section>
  );
}
