import { z } from "zod";
import { Id, SessionMs } from "./common.js";
import { DeskEvent, ScreenEvent } from "./events.js";
import { GuardVerdict } from "./guard.js";
import { OpenQuestion } from "./workmap.js";

/**
 * WebSocket protocol between browser and API (/sessions/:id/stream).
 * Every message is validated on both ends. Bump PROTOCOL_VERSION on any breaking change.
 */
export const PROTOCOL_VERSION = 1;

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), protocol: z.literal(PROTOCOL_VERSION), sessionId: Id }),
  z.object({
    type: z.literal("frame"),
    tMs: SessionMs,
    frameId: Id,
    jpegBase64: z.string().min(1),
    phash: z.string(),
  }),
  z.object({ type: z.literal("desk_event"), event: DeskEvent }),
  z.object({
    type: z.literal("transcript"),
    segmentId: Id,
    tStartMs: SessionMs,
    tEndMs: SessionMs,
    speaker: z.enum(["expert", "new_hire", "agent"]),
    text: z.string(),
  }),
  z.object({ type: z.literal("off_record"), on: z.boolean(), tMs: SessionMs }),
  z.object({ type: z.literal("question_asked"), questionId: Id, tMs: SessionMs }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const CandidateQuestion = z.object({
  id: Id,
  text: z.string().max(160),
  slot: OpenQuestion.shape.slot,
  priority: z.number().min(0).max(1),
  aboutTicketId: Id.optional(),
  createdAtMs: SessionMs,
});
export type CandidateQuestion = z.infer<typeof CandidateQuestion>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), protocol: z.literal(PROTOCOL_VERSION) }),
  z.object({ type: z.literal("screen_event"), event: ScreenEvent }),
  z.object({ type: z.literal("candidate_question"), question: CandidateQuestion }),
  z.object({ type: z.literal("guard_verdict"), requestId: Id, verdict: GuardVerdict }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
