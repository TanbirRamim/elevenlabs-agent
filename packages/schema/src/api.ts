import { z } from "zod";
import { Id, SessionMs } from "./common.js";
import { Outcome, Ticket } from "./ticket.js";
import { OpenQuestion, WorkMap } from "./workmap.js";

/**
 * REST contracts between apps/web (Tanbir) and apps/api (Harshit).
 * Every route in apps/api validates its input with these and returns exactly these shapes.
 * Paths are listed next to each schema so both sides use one name for one thing.
 */

/** A ticket as the browser may see it: the answer key (`label`) never leaves the API. */
export const PublicTicket = Ticket.omit({ label: true });
export type PublicTicket = z.infer<typeof PublicTicket>;

// GET /tickets?set=expert|new_hire|held_out
export const TicketSet = z.enum(["expert", "new_hire", "held_out"]);
export const TicketsResponse = z.object({ tickets: z.array(PublicTicket) });
export type TicketsResponse = z.infer<typeof TicketsResponse>;

// POST /sessions
export const CreateSessionRequest = z.object({
  mode: z.enum(["capture", "teach"]),
  /** Teach sessions reference the published map they teach from. */
  workMapId: Id.optional(),
});
export const CreateSessionResponse = z.object({ id: Id, mode: z.enum(["capture", "teach"]) });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

// PUT /sessions/:id/recording   (body: video/webm)  -> 204
// GET /sessions/:id/recording   -> video/webm, supports Range requests

// POST /sessions/:id/end  -> builds the draft map, returns what the debrief must ask
export const EndSessionResponse = z.object({
  workMapId: Id,
  coverage: z.number().min(0).max(1),
  openQuestions: z.array(OpenQuestion),
});
export type EndSessionResponse = z.infer<typeof EndSessionResponse>;

// POST /sessions/:id/debrief/answer
export const DebriefAnswerRequest = z.object({
  questionId: Id,
  /** Transcript segments (already sent over the WebSocket) that contain the expert's answer. */
  segmentIds: z.array(Id).min(1),
});
export const DebriefStatus = z.object({
  coverage: z.number().min(0).max(1),
  openQuestions: z.array(OpenQuestion),
  asked: z.number().int().nonnegative(),
  done: z.boolean(),
});
export type DebriefStatus = z.infer<typeof DebriefStatus>;

// POST /sessions/:id/teachback -> text for the agent to read back
export const TeachBackResponse = z.object({ text: z.string().max(1200) });

// POST /sessions/:id/teachback/confirm
export const TeachBackConfirmRequest = z.object({
  tMs: SessionMs,
  confirmed: z.boolean(),
  /** Transcript segments holding the expert's correction, when not confirmed. */
  correctionSegmentIds: z.array(Id).default([]),
});
export const TeachBackConfirmResponse = z.object({
  workMap: WorkMap,
  /** Present when a correction was applied: the one-sentence re-check to read back. */
  recheckText: z.string().optional(),
});

// POST /workmaps/:id/predictions -> two variants the apprentice predicts to prove understanding
export const PredictionVariants = z.object({
  variants: z
    .array(
      z.object({
        id: Id,
        description: z.string(),
        predictedOutcome: Outcome,
        becauseStepId: Id,
      }),
    )
    .max(3),
});

// GET   /workmaps/:id            -> WorkMap
// PATCH /workmaps/:id            -> WorkMap
export const WorkMapPatch = z.object({
  deleteStepIds: z.array(Id).default([]),
  deleteGuardrailIds: z.array(Id).default([]),
});
// POST  /workmaps/:id/publish    -> { id }
// GET   /workmaps/:id/markdown   -> text/markdown (tutor knowledge base)
// GET   /workmaps/published      -> WorkMap (latest published)

// POST /sessions/:id/predictions  (teach mode: the learner's answer to a [PREDICT])
export const LearnerPrediction = z.object({
  ticketId: Id,
  stepId: Id,
  predictedOutcome: Outcome,
  tMs: SessionMs,
});
export const LearnerPredictionResult = z.object({
  correct: z.boolean(),
  expectedOutcome: Outcome,
  reasonQuote: z.string(),
  frameId: Id,
});

// GET /sessions/:id/mastery -> MasteryReport (defined in guard.ts)

// Errors: every non-2xx response has this body.
export const ApiError = z.object({ code: z.string(), message: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;
