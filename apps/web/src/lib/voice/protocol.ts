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
  "[EXPLAIN]",
] as const;
export type ControlPrefix = (typeof CONTROL_PREFIXES)[number];

/** Contextual update (not a control message) carrying the Work Map for the tutor. */
export const WORKMAP_PREFIX = "[WORKMAP]";

/** Builds a hidden user message: `[ASK] text` or `[DEBRIEF] {"json":...}`. */
export function formatControl(prefix: ControlPrefix, payload: string | object): string {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return `${prefix} ${body}`;
}

/** True for messages the UI must not show in the transcript (control and screen context). */
export function isControlMessage(text: string): boolean {
  const t = text.trimStart();
  return (
    CONTROL_PREFIXES.some((p) => t.startsWith(p)) ||
    t.startsWith("[SCREEN ") ||
    t.startsWith(WORKMAP_PREFIX)
  );
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

/** Upper bound for the Work Map context, so one update never overwhelms the agent's context. */
export const WORKMAP_MAX_CHARS = 16_000;
const TRUNCATED_NOTE = "\n\n[Work Map truncated: anything not listed above is not covered.]";

/**
 * Contextual update carrying the published Work Map: `[WORKMAP]\n<markdown>`. A map longer than
 * `maxChars` is cut at the last line break that fits (never mid-quote where avoidable) and says so.
 */
export function formatWorkMapContext(markdown: string, maxChars = WORKMAP_MAX_CHARS): string {
  const body = markdown.trim();
  if (body.length <= maxChars) return `${WORKMAP_PREFIX}\n${body}`;
  const budget = Math.max(0, maxChars - TRUNCATED_NOTE.length);
  const slice = body.slice(0, budget);
  const cut = slice.lastIndexOf("\n");
  const kept = (cut > budget / 2 ? slice.slice(0, cut) : slice).trimEnd();
  return `${WORKMAP_PREFIX}\n${kept}${TRUNCATED_NOTE}`;
}
