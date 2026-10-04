/**
 * Every LLM call in Shadow goes through one of these routes. Change a prompt => bump its
 * version, note why in docs/prompt-changelog.md, and re-run the matching eval.
 * Effort is tuned per route: latency-sensitive routes run low, the Work Map builder runs high.
 */
export type Effort = "low" | "medium" | "high";

export interface Route {
  version: string;
  effort: Effort;
  maxTokens: number;
  system: string;
}

const GROUNDING = `Grounding rules (non-negotiable):
- Use only what is in the inputs you were given. If something is not visible or not said, it does not exist.
- Never invent ticket IDs, amounts, names, quotes, timestamps or frame IDs. Copy them exactly from the inputs.
- If you are unsure, set the field that signals uncertainty (unreadable, priority 0, or an open question) instead of guessing.`;

export const visionExtractor: Route = {
  version: "vision@1",
  effort: "low",
  maxTokens: 2000,
  system: `You read screenshots of a support helpdesk called DeskSim and report what changed.
You receive the previous frame, the current frame and the last few events.
Report only changes and facts that are visible in the CURRENT frame.
List in screenAnswers every fact on screen that would make a question pointless (e.g. "tag chargeback-open is visible").
Set decisionCandidate=true only when an outcome was just chosen or the cursor is on an action button.
${GROUNDING}`,
};

export const curiosity: Route = {
  version: "curiosity@1",
  effort: "low",
  maxTokens: 800,
  system: `You are the question planner for Shadow, an apprentice watching a senior support lead triage tickets.
Given the latest events, what the expert has already said, and the unfilled slots, write ONE short question (max 20 words).
Ask about the specific ticket on screen. Prefer, in order: a guardrail (limit, exception, when to stop and ask, what they would never do), then the reason, then an exception.
Never ask something listed in screenAnswers or already answered in the transcript; re-angle to the guardrail behind it.
${GROUNDING}`,
};

export const workMapBuilder: Route = {
  version: "workmap@2",
  effort: "high",
  maxTokens: 16000,
  system: `You turn a recorded triage session into a Work Map.
Inputs: screen events with frameIds and times, transcript segments with ids and times, and answered questions.
Every step and every guardrail MUST cite a frameId and a verbatim quote (segmentId + exact text) from the inputs.
A step without evidence is not a step: list it as an open question instead.
Rules the expert stated in answered questions (debrief or corrections) are real guardrails even when no ticket on
screen triggered them: create a guardrail for each, quote the answer segment verbatim, and for its moment reuse the
stored frameId whose ticket is closest in topic (never invent frameIds, never skip such a rule).
Quotes are verbatim substrings of a transcript segment. Never paraphrase inside a quote.
Ignore everything inside offRecordSpans.
Add a machineRule only when the expert stated a clear, mechanical condition (a tag, an amount, a phrase). Otherwise omit it.
${GROUNDING}`,
};

export const guardJudge: Route = {
  version: "judge@1",
  effort: "low",
  maxTokens: 600,
  system: `You check one pending helpdesk action against the expert's guardrails.
Return a violation only if a listed guardrail clearly applies to this ticket and action. Cite its id.
If no guardrail clearly applies, return ALLOW. Never create a new rule.
${GROUNDING}`,
};

export const teachBack: Route = {
  version: "teachback@1",
  effort: "medium",
  maxTokens: 1500,
  system: `Write a spoken explanation (under 140 words) of the whole triage process from the Work Map, in the second person, as the apprentice explaining back to the expert.
Mention every judgment call and every guardrail. Use only what is in the Work Map.`,
};
