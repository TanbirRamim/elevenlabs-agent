import { z } from "zod";
import { Id } from "./common.js";

export const Outcome = z.enum([
  "reply",
  "refund",
  "hold_request_info",
  "escalate_tier2",
  "escalate_engineering",
  "handoff_security",
  "handoff_legal",
  "handoff_billing_disputes",
  "close",
]);
export type Outcome = z.infer<typeof Outcome>;

export const Ticket = z.object({
  id: Id,
  subject: z.string(),
  body: z.string(),
  customer: z.object({
    name: z.string(),
    email: z.string(),
    plan: z.enum(["free", "monthly", "annual", "enterprise"]),
    vip: z.boolean(),
    accountAgeDays: z.number().int().nonnegative(),
  }),
  amountEur: z.number().nonnegative().optional(),
  tags: z.array(z.string()),
  knownBugId: z.string().optional(),
  /** Seed-only: the expert's correct decision. Never sent to the browser in Teach mode. */
  label: z
    .object({
      outcome: Outcome,
      guardrails: z.array(Id),
      set: z.enum(["expert", "new_hire", "held_out"]),
    })
    .optional(),
});
export type Ticket = z.infer<typeof Ticket>;
