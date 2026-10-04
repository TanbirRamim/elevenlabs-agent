import type { OpenQuestion, Outcome } from "@shadow/schema";

interface Probe {
  requires: Outcome;
  question: OpenQuestion;
}

/** The outcomes a session can miss, and the debrief question that covers each (§6.5). */
const PROBES: Probe[] = [
  {
    requires: "handoff_security",
    question: {
      id: "probe_security",
      slot: "guardrail",
      text: "What do you do when a customer reports fraud, a hacked account, or a charge they never made?",
      priority: 0.9,
    },
  },
  {
    requires: "handoff_legal",
    question: {
      id: "probe_legal",
      slot: "guardrail",
      text: "What do you do when a customer mentions a lawyer, legal action, or GDPR data deletion?",
      priority: 0.85,
    },
  },
  {
    requires: "escalate_engineering",
    question: {
      id: "probe_engineering",
      slot: "exception",
      text: "When a known bug caused the problem, do you still refund or does it go to Engineering?",
      priority: 0.75,
    },
  },
];

/** Up to 3 "cases I haven't seen" debrief questions. This is how the N1 fraud rule gets learned. */
export function unseenCaseProbes(observedOutcomes: readonly Outcome[]): OpenQuestion[] {
  const seen = new Set(observedOutcomes);
  return PROBES.filter((p) => !seen.has(p.requires))
    .slice(0, 3)
    .map((p) => p.question);
}
