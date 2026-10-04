import type { VoiceEndReason } from "@/lib/voice";

/** Why a capture stopped: the expert, the browser's share bar, or the voice call ending. */
export type EndReason = "stopped" | "share_ended" | "agent_ended" | "voice_lost";

/**
 * Off the record and paused both hold the voice agent: it hears nothing (mic muted to it) and
 * says nothing (output silenced) until the expert resumes.
 */
export function voiceHold(s: { offRecord: boolean; paused: boolean }): boolean {
  return s.offRecord || s.paused;
}

/**
 * The voice call ended on its own (the agent hung up, or the connection failed). During a live
 * capture that ends the whole capture; at any other phase there is nothing left to stop.
 */
export function endReasonForVoice(phase: string, reason: VoiceEndReason): EndReason | null {
  if (phase !== "capturing") return null;
  return reason === "agent" ? "agent_ended" : "voice_lost";
}
