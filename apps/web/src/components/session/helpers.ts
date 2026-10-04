import type { DeskEvent, Outcome } from "@shadow/schema";
import type { OrbState } from "@/components/voice/orbState";
import type { VoiceStatus } from "@/lib/voice";

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

/**
 * What the voice orb shows for the live session. Off the record wins over everything; without a
 * connected voice session Shadow is quiet; otherwise it is asking while the agent speaks.
 */
export function orbStateFor(
  status: VoiceStatus,
  mode: "speaking" | "listening",
  agentSpeaking: boolean,
  offRecord: boolean,
): OrbState {
  if (offRecord) return "off-record";
  if (status !== "connected") return "idle";
  return agentSpeaking || mode === "speaking" ? "speaking" : "listening";
}
