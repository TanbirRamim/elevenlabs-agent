import { type ScreenEvent, VisionResult } from "@shadow/schema";

const VisionEvent = VisionResult.shape.events.element;

/** One line of what the vision model read off a frame, in the brief's words. */
export interface VisionLine {
  id: string;
  tMs: number;
  text: string;
}

/** "ticket T3" -> "T3"; anything without a record id is kept as written. */
function recordName(object: string): string {
  const id =
    /\b#?([a-z]{1,3}-?\d+)\b/i.exec(object)?.[1] ?? /(?:^|[\s#])(\d{2,})\b/.exec(object)?.[1];
  return id ? id.toUpperCase() : object.trim();
}

const blank = (v: string | undefined) => (v == null || v.trim() === "" ? "–" : v.trim());

/**
 * A vision screen_event as "T3 opened", "refund amount changed 0 → 240", "T3: hand off to
 * Security". DOM events and unparseable payloads return null so only Claude's reading shows.
 */
export function visionLine(event: ScreenEvent): VisionLine | null {
  if (event.source !== "vision") return null;
  const parsed = VisionEvent.safeParse(event.payload);
  if (!parsed.success) return null;
  const e = parsed.data;
  const name = recordName(e.object);
  let text: string;
  switch (e.kind) {
    case "opened":
      text = `${name} opened`;
      break;
    case "field_changed": {
      const field = (e.field ?? e.object).replace(/_/g, " ").trim().toLowerCase();
      text = `${field} changed ${blank(e.from)} → ${blank(e.to)}`;
      break;
    }
    case "action":
      text = `${name}: ${e.to ?? e.fact ?? "action"}`;
      break;
    default:
      text = `${name}: ${e.fact ?? ""}`.trim();
  }
  return { id: event.id, tMs: event.tMs, text };
}

/** Newest first, capped: the live feed keeps the last few readings only. */
export function pushVisionLine(lines: VisionLine[], event: ScreenEvent, max = 5): VisionLine[] {
  const line = visionLine(event);
  return line ? [line, ...lines].slice(0, max) : lines;
}
