import type { TranscriptSegment } from "@shadow/schema";
import { normalize } from "./normalize.js";

export interface EvidenceContext {
  transcript: readonly TranscriptSegment[];
  storedFrameIds: readonly string[];
  offRecordSpans: readonly [number, number][];
}

export interface Violation {
  kind:
    | "quote_not_verbatim"
    | "quote_not_expert"
    | "unknown_segment"
    | "unknown_frame"
    | "off_record"
    | "machine_rule_unsupported";
  stepId?: string;
  guardrailId?: string;
  detail: string;
}

// Structural so both the generation draft and the final WorkMap verify.
interface QuoteLike {
  text: string;
  segmentId: string;
  tMs: number;
}
interface MomentLike {
  frameId: string;
  tMs: number;
}
interface DraftShape {
  steps: { id: string; reason: QuoteLike; moment: MomentLike }[];
  guardrails: {
    id: string;
    evidence: { quote: QuoteLike; moment: MomentLike };
    machineRule?: { when: { bodyMatchesAny?: string[] | undefined } } | undefined;
  }[];
}

function inSpan(tMs: number, spans: readonly [number, number][]): boolean {
  return spans.some(([a, b]) => tMs >= a && tMs <= b);
}

/**
 * Deterministic and pure (§6.6): every quote is a verbatim substring of its
 * expert segment, every frame exists, nothing cites off-the-record time, and a
 * machineRule's bodyMatchesAny phrases must appear in the cited quote.
 */
export function verifyEvidence(draft: DraftShape, ctx: EvidenceContext): Violation[] {
  const violations: Violation[] = [];
  const segments = new Map(ctx.transcript.map((s) => [s.id, s]));
  const frames = new Set(ctx.storedFrameIds);

  const checkQuote = (quote: QuoteLike, where: Partial<Violation>, label: string) => {
    const segment = segments.get(quote.segmentId);
    if (!segment) {
      violations.push({
        kind: "unknown_segment",
        ...where,
        detail: `${label} cites segment ${quote.segmentId}, which does not exist`,
      });
      return;
    }
    if (segment.speaker !== "expert") {
      violations.push({
        kind: "quote_not_expert",
        ...where,
        detail: `${label} quotes segment ${quote.segmentId}, spoken by ${segment.speaker}`,
      });
    }
    if (!normalize(segment.text).includes(normalize(quote.text))) {
      violations.push({
        kind: "quote_not_verbatim",
        ...where,
        detail: `${label} quote "${quote.text.slice(0, 60)}" is not a substring of segment ${quote.segmentId}`,
      });
    }
    if (inSpan(quote.tMs, ctx.offRecordSpans)) {
      violations.push({
        kind: "off_record",
        ...where,
        detail: `${label} quote at ${quote.tMs}ms is inside an off-the-record span`,
      });
    }
  };

  const checkFrame = (frameId: string, tMs: number, where: Partial<Violation>, label: string) => {
    if (!frames.has(frameId)) {
      violations.push({
        kind: "unknown_frame",
        ...where,
        detail: `${label} cites frame ${frameId}, which was never stored`,
      });
    }
    if (inSpan(tMs, ctx.offRecordSpans)) {
      violations.push({
        kind: "off_record",
        ...where,
        detail: `${label} moment at ${tMs}ms is inside an off-the-record span`,
      });
    }
  };

  for (const step of draft.steps) {
    checkQuote(step.reason, { stepId: step.id }, `step ${step.id}`);
    checkFrame(step.moment.frameId, step.moment.tMs, { stepId: step.id }, `step ${step.id}`);
  }
  for (const guardrail of draft.guardrails) {
    const where = { guardrailId: guardrail.id };
    checkQuote(guardrail.evidence.quote, where, `guardrail ${guardrail.id}`);
    checkFrame(
      guardrail.evidence.moment.frameId,
      guardrail.evidence.moment.tMs,
      where,
      `guardrail ${guardrail.id}`,
    );
    const phrases = guardrail.machineRule?.when.bodyMatchesAny ?? [];
    const quoteNorm = normalize(guardrail.evidence.quote.text);
    for (const phrase of phrases) {
      if (!quoteNorm.includes(normalize(phrase))) {
        violations.push({
          kind: "machine_rule_unsupported",
          ...where,
          detail: `guardrail ${guardrail.id} machineRule phrase "${phrase}" is not in the cited quote`,
        });
      }
    }
  }
  return violations;
}
