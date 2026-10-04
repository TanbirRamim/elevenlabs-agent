import type { Outcome } from "@shadow/schema";
import type { PredictionVariant } from "./machine";

/** The subset of a voice transcript line the debrief reads. */
export interface DebriefLine {
  id: string;
  role: "user" | "agent";
  text: string;
}

export interface CollectedAnswer {
  /** Expert lines that count as the answer, in order. */
  segmentIds: string[];
  /** True once Singoda AI spoke again after the expert: the answer is over. */
  complete: boolean;
  /** Index of the Singoda AI line that ended the answer, or -1. The next answer starts there. */
  endIndex: number;
}

/**
 * The expert's answer since `since`: their lines from that index on, up to the first Singoda AI
 * line that follows at least one of them. Lines for which `eligible` is false (never sent to
 * the API, e.g. spoken off the record) are skipped, since the API only knows sent segments.
 */
export function collectAnswer(
  lines: readonly DebriefLine[],
  since: number,
  eligible: (id: string) => boolean = () => true,
): CollectedAnswer {
  const segmentIds: string[] = [];
  for (let i = Math.max(0, since); i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.role === "agent") {
      if (segmentIds.length > 0) return { segmentIds, complete: true, endIndex: i };
      continue;
    }
    if (eligible(line.id)) segmentIds.push(line.id);
  }
  return { segmentIds, complete: false, endIndex: -1 };
}

export type Confirmation = "yes" | "no";

// Negative cues win: "yes, but above 500 it's Legal" is a correction, not a confirmation.
const NO_CUES = [
  /\bno\b/,
  /\bnope\b/,
  /\bnah\b/,
  /\bnot (?:quite|really|exactly|right|correct|true)\b/,
  /\b(?:isn't|isnt|that's not|thats not) (?:right|correct|it|how)\b/,
  /\bwrong\b/,
  /\bactually\b/,
  /\bbut\b/,
  /\bexcept\b/,
  /\bcorrect (?:that|this|you|one)\b/,
  /\bmistake\b/,
];
const YES_CUES = [
  /\byes\b/,
  /\byeah\b/,
  /\byep\b/,
  /\byup\b/,
  /\bcorrect\b/,
  /\bright\b/,
  /\bexactly\b/,
  /\bthat's it\b/,
  /\bspot on\b/,
  /\bsounds good\b/,
  /\bconfirm(?:ed)?\b/,
  /\bperfect\b/,
];

/** Reads a spoken yes or no from one expert line; null when the line is neither. */
export function detectConfirmation(text: string): Confirmation | null {
  const t = text.toLowerCase().replace(/[’`]/g, "'");
  if (NO_CUES.some((re) => re.test(t))) return "no";
  if (YES_CUES.some((re) => re.test(t))) return "yes";
  return null;
}

/** The first yes/no among the expert's eligible lines from `since` on. */
export function firstConfirmation(
  lines: readonly DebriefLine[],
  since: number,
  eligible: (id: string) => boolean = () => true,
): { answer: Confirmation; index: number } | null {
  for (let i = Math.max(0, since); i < lines.length; i++) {
    const line = lines[i];
    if (line?.role !== "user" || !eligible(line.id)) continue;
    const answer = detectConfirmation(line.text);
    if (answer) return { answer, index: i };
  }
  return null;
}

const OUTCOME_PHRASE: Record<Outcome, string> = {
  reply: "reply to the customer",
  refund: "refund it",
  hold_request_info: "put it on hold and ask for more information",
  escalate_tier2: "escalate it to Tier 2",
  escalate_engineering: "escalate it to Engineering",
  handoff_security: "hand it off to Security",
  handoff_legal: "hand it off to Legal",
  handoff_billing_disputes: "hand it off to Billing disputes",
  close: "close it",
};

/** Short label for an outcome, for buttons and lists. */
export function outcomePhrase(outcome: Outcome): string {
  return OUTCOME_PHRASE[outcome];
}

/** The sentence Singoda AI says for one prediction, e.g. "Prediction 1 of 2: … I would refund it …". */
export function predictionSentence(
  variant: PredictionVariant,
  index: number,
  total: number,
  stepTitle?: string,
): string {
  const because = stepTitle
    ? `because of the step "${stepTitle}"`
    : `because of step ${variant.becauseStepId}`;
  const description = variant.description.trim().replace(/[.\s]+$/, "");
  return `Prediction ${index + 1} of ${total}: ${description}. I would ${outcomePhrase(variant.predictedOutcome)}, ${because}. Is that right or wrong?`;
}
