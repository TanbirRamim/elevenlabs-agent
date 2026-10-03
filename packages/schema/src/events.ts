import { z } from "zod";
import { Id, SessionMs } from "./common.js";
import { Outcome } from "./ticket.js";

/** Ground-truth events emitted by DeskSim's DOM. */
export const DeskEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ticket_opened"), tMs: SessionMs, ticketId: Id }),
  z.object({
    type: z.literal("field_changed"),
    tMs: SessionMs,
    ticketId: Id,
    field: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  z.object({
    type: z.literal("action_committed"),
    tMs: SessionMs,
    ticketId: Id,
    outcome: Outcome,
    amountEur: z.number().optional(),
  }),
  z.object({ type: z.literal("input_activity"), tMs: SessionMs }),
]);
export type DeskEvent = z.infer<typeof DeskEvent>;

/** Output contract of the vision extractor. Anything not visible must not appear here. */
export const VisionResult = z.object({
  events: z.array(
    z.object({
      kind: z.enum(["opened", "field_changed", "action", "visible_fact"]),
      object: z.string().describe("e.g. 'ticket T3'"),
      field: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      fact: z.string().optional(),
    }),
  ),
  decisionCandidate: z
    .boolean()
    .describe("true if the expert just made or is about to make a decision"),
  screenAnswers: z
    .array(z.string())
    .describe("facts already visible that a question must not ask about"),
  unreadable: z.boolean().describe("true if the frame could not be read reliably"),
});
export type VisionResult = z.infer<typeof VisionResult>;

export const ScreenEvent = z.object({
  id: Id,
  tMs: SessionMs,
  frameId: Id,
  source: z.enum(["vision", "dom"]),
  summary: z.string().max(240),
  payload: z.record(z.string(), z.unknown()),
});
export type ScreenEvent = z.infer<typeof ScreenEvent>;

export const TranscriptSegment = z.object({
  id: Id,
  tStartMs: SessionMs,
  tEndMs: SessionMs,
  speaker: z.enum(["expert", "new_hire", "agent"]),
  text: z.string(),
  offRecord: z.boolean().default(false),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;
