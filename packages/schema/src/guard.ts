import { z } from "zod";
import { Id } from "./common.js";
import { Outcome, Ticket } from "./ticket.js";

export const PendingAction = z.object({
  ticket: Ticket.omit({ label: true }),
  outcome: Outcome,
  amountEur: z.number().nonnegative().optional(),
});
export type PendingAction = z.infer<typeof PendingAction>;

export const GuardVerdict = z.object({
  decision: z.enum(["ALLOW", "BLOCK", "REQUIRE_APPROVAL", "WARN"]),
  ruleIds: z.array(Id),
  expectedOutcome: Outcome.optional(),
  source: z.enum(["machine_rule", "llm_judge", "timeout_allow"]),
});
export type GuardVerdict = z.infer<typeof GuardVerdict>;

export const MasteryEntry = z.object({
  stepOrGuardrailId: Id,
  status: z.enum(["independent", "assisted", "missed"]),
  ticketId: Id,
});
export const MasteryReport = z.object({
  sessionId: Id,
  workMapId: Id,
  entries: z.array(MasteryEntry),
  practiceNext: z.array(Id),
});
export type MasteryReport = z.infer<typeof MasteryReport>;
