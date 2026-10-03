/**
 * The control protocol between the web app and the ElevenAgents conversation.
 * Spec: agents/README.md. Pure functions; tested in protocol.test.ts.
 */
export const CONTROL_PREFIXES = [
  "[ASK]",
  "[DEBRIEF]",
  "[TEACHBACK]",
  "[INTERVENE]",
  "[PREDICT]",
] as const;
export type ControlPrefix = (typeof CONTROL_PREFIXES)[number];

/** Builds a hidden user message: `[ASK] text` or `[DEBRIEF] {"json":...}`. */
export function formatControl(prefix: ControlPrefix, payload: string | object): string {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return `${prefix} ${body}`;
}

/** True for messages the UI must not show in the transcript (control and screen context). */
export function isControlMessage(text: string): boolean {
  const t = text.trimStart();
  return CONTROL_PREFIXES.some((p) => t.startsWith(p)) || t.startsWith("[SCREEN ");
}

/** 0-padded minutes:seconds for a session-relative time. */
export function mmss(tMs: number): string {
  const total = Math.max(0, Math.floor(tMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Contextual update text for a screen event: `[SCREEN 03:12] T3 status Open -> On hold`. */
export function formatScreenUpdate(tMs: number, summary: string): string {
  return `[SCREEN ${mmss(tMs)}] ${summary.trim()}`;
}
