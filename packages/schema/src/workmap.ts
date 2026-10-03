import { z } from "zod";
import { Id, Quote, ScreenMoment, SessionMs } from "./common.js";
import { Outcome } from "./ticket.js";

export const MachineRule = z.object({
  when: z.object({
    action: Outcome.optional(),
    anyTag: z.array(z.string()).optional(),
    bodyMatchesAny: z.array(z.string()).optional().describe("case-insensitive substrings"),
    amountEurAbove: z.number().optional(),
    vip: z.boolean().optional(),
  }),
  effect: z.enum(["BLOCK", "REQUIRE_APPROVAL", "WARN"]),
  expectedOutcome: Outcome.optional(),
});
export type MachineRule = z.infer<typeof MachineRule>;

export const Guardrail = z.object({
  id: Id,
  type: z.enum(["limit", "exception", "stop_and_ask", "never"]),
  condition: z.string(),
  action: z.string(),
  evidence: z.object({ quote: Quote, moment: ScreenMoment }),
  machineRule: MachineRule.optional(),
});
export type Guardrail = z.infer<typeof Guardrail>;

export const Step = z.object({
  id: Id,
  order: z.number().int().positive(),
  title: z.string(),
  moment: ScreenMoment,
  decision: z.string(),
  reason: Quote,
  guardrailIds: z.array(Id),
  judgmentCall: z.boolean(),
});
export type Step = z.infer<typeof Step>;

export const OpenQuestion = z.object({
  id: Id,
  aboutStepId: Id.optional(),
  slot: z.enum(["reason", "guardrail", "exception", "escalation_contact"]),
  text: z.string(),
  priority: z.number().min(0).max(1),
});
export type OpenQuestion = z.infer<typeof OpenQuestion>;

export const WorkMap = z
  .object({
    id: Id,
    version: z.number().int().positive(),
    workflow: z.string(),
    expertName: z.string(),
    language: z.string().default("en"),
    steps: z.array(Step).min(1),
    guardrails: z.array(Guardrail),
    openQuestions: z.array(OpenQuestion),
    offRecordSpans: z.array(z.tuple([SessionMs, SessionMs])),
    coverage: z.number().min(0).max(1),
    teachBackConfirmedAtMs: SessionMs.nullable(),
  })
  .superRefine((map, ctx) => {
    const ids = new Set(map.guardrails.map((g) => g.id));
    for (const step of map.steps) {
      for (const gid of step.guardrailIds) {
        if (!ids.has(gid)) {
          ctx.addIssue({
            code: "custom",
            message: `step ${step.id} references unknown guardrail ${gid}`,
          });
        }
      }
    }
    for (const [start, end] of map.offRecordSpans) {
      const inside = (t: number) => t >= start && t <= end;
      for (const step of map.steps) {
        if (inside(step.reason.tMs) || inside(step.moment.tMs)) {
          ctx.addIssue({ code: "custom", message: `step ${step.id} cites off-the-record time` });
        }
      }
    }
  });
export type WorkMap = z.infer<typeof WorkMap>;
