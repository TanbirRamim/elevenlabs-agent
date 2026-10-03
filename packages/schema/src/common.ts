import { z } from "zod";

/** Milliseconds since the session started. All timelines use this, never wall-clock. */
export const SessionMs = z.number().int().nonnegative();

export const Id = z.string().min(1).max(64);

/** A pointer into the screen recording: the evidence for every step and guardrail. */
export const ScreenMoment = z.object({
  tMs: SessionMs,
  frameId: Id,
  clip: z.tuple([SessionMs, SessionMs]).describe("[startMs, endMs] for replay"),
});
export type ScreenMoment = z.infer<typeof ScreenMoment>;

/** A verbatim span of what a person said. Quotes are never paraphrased. */
export const Quote = z.object({
  text: z.string().min(1),
  segmentId: Id,
  tMs: SessionMs,
  speaker: z.enum(["expert", "new_hire", "agent"]),
  source: z.enum(["live_question", "think_aloud", "debrief", "teach_back"]),
});
export type Quote = z.infer<typeof Quote>;
