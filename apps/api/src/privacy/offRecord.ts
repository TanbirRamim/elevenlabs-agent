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
