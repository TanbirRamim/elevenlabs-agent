import type { DeskEvent, Outcome } from "@shadow/schema";

const OUTCOME_LABEL: Record<Outcome, string> = {
  reply: "replied",
  refund: "refunded",
  hold_request_info: "put on hold for more info",
  escalate_tier2: "escalated to Tier 2",
  escalate_engineering: "escalated to Engineering",
  handoff_security: "handed off to Security",
  handoff_legal: "handed off to Legal",
  handoff_billing_disputes: "handed off to Billing disputes",
  close: "closed",
};

/**
 * One-line description of a DeskSim event for the agent's screen context.
 * Returns null for events the agent should not be told about (raw input activity).
 */
export function describeDeskEvent(e: DeskEvent): string | null {
  switch (e.type) {
    case "ticket_opened":
      return `ticket ${e.ticketId} opened`;
    case "field_changed":
      return `ticket ${e.ticketId}: ${e.field} changed from ${e.from ?? "empty"} to ${e.to ?? "empty"}`;
    case "action_committed": {
      const amount = e.amountEur === undefined ? "" : ` (€${e.amountEur})`;
      return `ticket ${e.ticketId} ${OUTCOME_LABEL[e.outcome]}${amount}`;
    }
    case "input_activity":
      return null;
  }
}

export type RecordPhrase = "off" | "on" | null;

/**
 * Detects the spoken "off the record" / "back on the record" commands in an expert's line.
 * "back on the record" wins if both appear, so a single correction line re-enables recording.
 */
export function detectRecordPhrase(text: string): RecordPhrase {
  const t = text.toLowerCase();
  if (/\bback on the record\b/.test(t)) return "on";
  if (/\boff the record\b/.test(t)) return "off";
  return null;
}
