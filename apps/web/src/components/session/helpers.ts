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
 * connected voice session Singoda AI is quiet; otherwise it is asking while the agent speaks.
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

export type LiveVoiceState = "listening" | "asking" | "quiet" | "off";

/**
 * What the ListeningIndicator shows. Without a connected voice session the voice is off. While
 * Singoda AI's audio plays it is asking. Off the record or paused it holds every question (quiet);
 * otherwise it is listening.
 */
export function listeningStateFor(
  status: VoiceStatus,
  mode: "speaking" | "listening",
  agentSpeaking: boolean,
  holding: boolean,
): LiveVoiceState {
  if (status !== "connected") return "off";
  if (agentSpeaking || mode === "speaking") return "asking";
  return holding ? "quiet" : "listening";
}

const TEN_MINUTES_MS = 600_000;

/** Questions asked in the ten minutes before `nowMs`: what the Turn Gate's budget counts. */
export function questionsInWindow(askedAtMs: readonly number[], nowMs: number): number {
  return askedAtMs.filter((t) => t <= nowMs && nowMs - t < TEN_MINUTES_MS).length;
}

/** Milliseconds until the gate's minimum gap after the last question has passed; 0 when it has. */
export function gapRemainingMs(
  askedAtMs: readonly number[],
  nowMs: number,
  minGapMs: number,
): number {
  const last = askedAtMs.at(-1);
  if (last === undefined) return 0;
  return Math.max(0, minGapMs - (nowMs - last));
}

/**
 * Maps the voice SDK's input volume (mean of the 100 to 8000 Hz frequency bins, 0..1; speech
 * sits around 0.1 to 0.4) to a meter level, and eases the fall so the meter does not flicker.
 * Rises are immediate so speech onsets show at once.
 */
export function micLevel(volume: number, previous = 0): number {
  const raw = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume * 2.5)) : 0;
  return raw >= previous ? raw : previous * 0.6 + raw * 0.4;
}
