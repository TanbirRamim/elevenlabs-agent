import type { SessionRecord } from "../store/memory.js";

/** Toggle off-the-record. While on, frames and transcript for the session are dropped, not stored. */
export function setOffRecord(session: SessionRecord, on: boolean, tMs: number): void {
  const state = session.offRecord;
  if (on && !state.on) {
    state.on = true;
    state.since = tMs;
  } else if (!on && state.on) {
    state.spans.push([state.since ?? tMs, tMs]);
    state.on = false;
    state.since = null;
  }
}

export function isOffRecord(session: SessionRecord, tMs: number): boolean {
  if (session.offRecord.on) return true;
  return session.offRecord.spans.some(([a, b]) => tMs >= a && tMs <= b);
}

/**
 * Spoken toggle in an expert segment: "off the record" -> true, "back on the
 * record" -> false, anything else -> null. Mirrors the UI toggle; both are
 * idempotent through setOffRecord.
 */
export function offRecordPhrase(text: string): boolean | null {
  const t = text.toLowerCase();
  if (/\bback on the record\b/.test(t)) return false;
  if (/\boff the record\b/.test(t)) return true;
  return null;
}
