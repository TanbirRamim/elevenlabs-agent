import { workMapBuilder } from "@shadow/prompts";
import { Guardrail, Id, OpenQuestion, SessionMs, Step, WorkMap } from "@shadow/schema";
import { z } from "zod";
import type { AnsweredQuestion } from "../curiosity/engine.js";
import { type LlmDeps, structured } from "../llm/structured.js";
import type { SessionRecord } from "../store/memory.js";
import { type EvidenceContext, type Violation, verifyEvidence } from "./verify.js";

/**
 * Generation schema: the WorkMap object shape WITHOUT the superRefine and
 * WITHOUT z.tuple (neither survives the SDK's zod -> output-format conversion;
 * a 2-element array parses back into the real tuple schema at the final
 * WorkMap.parse). The deterministic verifier below is the real gate;
 * packages/schema stays untouched.
 */
const SpanDraft = z.array(SessionMs).min(2).max(2).describe("[startMs, endMs]");
const MomentDraft = z.object({ tMs: SessionMs, frameId: Id, clip: SpanDraft });
const StepDraft = Step.extend({ moment: MomentDraft });
const GuardrailDraft = Guardrail.extend({
  evidence: z.object({ quote: Guardrail.shape.evidence.shape.quote, moment: MomentDraft }),
});
export const WorkMapDraft = z.object({
  id: Id,
  version: z.number().int().positive(),
  workflow: z.string(),
  expertName: z.string(),
  language: z.string().default("en"),
  steps: z.array(StepDraft).min(1),
  guardrails: z.array(GuardrailDraft),
  openQuestions: z.array(OpenQuestion),
  offRecordSpans: z.array(SpanDraft),
  coverage: z.number().min(0).max(1),
  teachBackConfirmedAtMs: SessionMs.nullable(),
});
export type WorkMapDraft = z.infer<typeof WorkMapDraft>;

export interface BuildResult {
  map: WorkMap;
  /** Open questions created for steps/guardrails that failed evidence checks. */
  removed: OpenQuestion[];
}

export interface BuildDeps {
  /** Test seam; default generates via the workMapBuilder route. */
  generate?: (content: string) => Promise<WorkMapDraft>;
}

function sessionContext(session: SessionRecord): EvidenceContext {
  return {
    transcript: session.transcript,
    storedFrameIds: session.storedFrameIds,
    offRecordSpans: session.offRecord.spans,
  };
}

function buildContent(session: SessionRecord, answered: AnsweredQuestion[]): string {
  return JSON.stringify({
    events: session.events.map((e) => ({
      id: e.id,
      tMs: e.tMs,
      frameId: e.frameId,
      source: e.source,
      summary: e.summary,
    })),
    transcript: session.transcript.map((s) => ({
      segmentId: s.id,
      tStartMs: s.tStartMs,
      tEndMs: s.tEndMs,
      speaker: s.speaker,
      text: s.text,
    })),
    answeredQuestions: answered,
    offRecordSpans: session.offRecord.spans,
    storedFrameIds: session.storedFrameIds,
  });
}

/**
 * Draft via the workmap@1 route -> deterministic verifyEvidence -> ONE repair
 * pass with the violation list -> anything still failing is removed and becomes
 * an OpenQuestion (§6.6). The returned map passed WorkMap.parse (superRefine on).
 */
export async function buildWorkMap(
  llm: LlmDeps,
  session: SessionRecord,
  answered: AnsweredQuestion[],
  { generate }: BuildDeps = {},
): Promise<BuildResult> {
  const generateFn =
    generate ??
    ((content: string) =>
      structured(llm, workMapBuilder, WorkMapDraft, [{ type: "text", text: content }]));
  const ctx = sessionContext(session);
  const content = buildContent(session, answered);

  let draft = await generateFn(content);
  let violations = verifyEvidence(draft, ctx);
  if (violations.length > 0) {
    try {
      const repaired = await generateFn(
        `${content}\n\nYour previous map had evidence violations. Fix or remove the affected steps/guardrails; never invent evidence:\n${JSON.stringify(violations)}`,
      );
      draft = repaired;
      violations = verifyEvidence(draft, ctx);
    } catch {
      // A failed repair call must not discard the first draft: its verified part is still
      // usable, and what failed becomes open questions below exactly as after a repair.
    }
  }

  const removed: OpenQuestion[] = [];
  let openN = 0;
  const badSteps = new Set<string>();
  const badGuardrails = new Set<string>();
  const unsupportedRules = new Set<string>();
  for (const v of violations) {
    if (v.kind === "machine_rule_unsupported" && v.guardrailId) {
      unsupportedRules.add(v.guardrailId);
    } else if (v.stepId) {
      badSteps.add(v.stepId);
    } else if (v.guardrailId) {
      badGuardrails.add(v.guardrailId);
    }
  }

  const describe = (id: string) =>
    violations
      .filter((v) => v.stepId === id || v.guardrailId === id)
      .map((v) => v.detail)
      .join("; ");

  const steps = draft.steps.filter((s) => {
    if (!badSteps.has(s.id)) return true;
    openN += 1;
    removed.push({
      id: `oq_removed_${openN}`,
      slot: "reason",
      text: `Walk me through "${s.title}" again — the recording could not evidence it (${describe(s.id)}).`.slice(
        0,
        300,
      ),
      priority: 0.8,
    });
    return false;
  });
  const guardrails = draft.guardrails.flatMap((g) => {
    if (badGuardrails.has(g.id)) {
      openN += 1;
      removed.push({
        id: `oq_removed_${openN}`,
        slot: "guardrail",
        text: `What is the exact rule behind "${g.condition}"? The cited evidence did not hold (${describe(g.id)}).`.slice(
          0,
          300,
        ),
        priority: 0.9,
      });
      return [];
    }
    if (unsupportedRules.has(g.id)) {
      // Keep the guardrail, drop only the machine rule (§6.6).
      const { machineRule: _machineRule, ...rest } = g;
      return [rest];
    }
    return [g];
  });
  if (steps.length === 0) {
    throw new Error("work map has no evidenced steps after verification");
  }
  const guardrailIds = new Set(guardrails.map((g) => g.id));

  const map = WorkMap.parse({
    ...draft,
    id: `wm_${session.id.replace(/^ses_/, "")}`,
    steps: steps.map((s) => ({
      ...s,
      guardrailIds: s.guardrailIds.filter((id) => guardrailIds.has(id)),
    })),
    guardrails,
    openQuestions: [...draft.openQuestions, ...removed],
    // The session, not the model, is the authority on what was off the record.
    offRecordSpans: session.offRecord.spans,
    teachBackConfirmedAtMs: null,
    // Where the tutor finds the expert's recording for clip replay.
    sourceSessionId: session.id,
  });
  return { map, removed };
}
