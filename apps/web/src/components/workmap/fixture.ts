import type { Quote, ScreenMoment, WorkMap } from "@shadow/schema";

/**
 * Sample Work Map for the support-escalation workflow. Shown only when the API is
 * unreachable or `?fixture=1` is set, always with a visible "sample data" badge.
 * It is not demo truth: the live demo derives its map from the expert's own session.
 */

const expertQuote = (
  text: string,
  segmentId: string,
  tMs: number,
  source: Quote["source"],
): Quote => ({ text, segmentId, tMs, speaker: "expert", source });

const moment = (tMs: number, frameId: string, beforeMs = 6_000, afterMs = 6_000): ScreenMoment => ({
  tMs,
  frameId,
  clip: [Math.max(0, tMs - beforeMs), tMs + afterMs],
});

export const sampleWorkMap: WorkMap = {
  id: "wm_sample",
  version: 3,
  workflow: "Support escalation triage",
  expertName: "Maya",
  language: "en",
  steps: [
    {
      id: "S1",
      order: 1,
      title: "Read the whole ticket before touching any button",
      moment: moment(38_000, "f_0038"),
      decision: "Opened T1, read body, tags and plan first",
      reason: expertQuote(
        "I always read the tags and the plan before I decide anything, that's where the surprises hide.",
        "seg_004",
        41_500,
        "think_aloud",
      ),
      guardrailIds: [],
      judgmentCall: false,
    },
    {
      id: "S2",
      order: 2,
      title: "Plain billing question gets the invoice macro",
      moment: moment(80_000, "f_0080"),
      decision: "Replied to T1 with the invoice macro",
      reason: expertQuote(
        "It's a monthly plan, no VIP tag, so the macro is fine. VIPs get a custom reply, never a macro.",
        "seg_009",
        84_000,
        "live_question",
      ),
      guardrailIds: [],
      judgmentCall: false,
    },
    {
      id: "S3",
      order: 3,
      title: "Refund a duplicate charge when it is under the limit",
      moment: moment(185_000, "f_0185"),
      decision: "Refunded one of the two 49 EUR charges on T2",
      reason: expertQuote(
        "Forty-nine euros I can refund on my own. Anything over a hundred I need a second pair of eyes on.",
        "seg_021",
        191_000,
        "live_question",
      ),
      guardrailIds: ["G1"],
      judgmentCall: true,
    },
    {
      id: "S4",
      order: 4,
      title: "Check disputes before refunding",
      moment: moment(310_000, "f_0310"),
      decision: "Held the 240 EUR refund on T3 and routed it to Billing disputes",
      reason: expertQuote(
        "There's a chargeback open on this account. Never refund with an open chargeback, we'd pay twice.",
        "seg_034",
        316_000,
        "live_question",
      ),
      guardrailIds: ["G2", "G1"],
      judgmentCall: true,
    },
    {
      id: "S5",
      order: 5,
      title: "Treat a changed email as an account-takeover signal",
      moment: moment(460_000, "f_0460"),
      decision: "No refund on T4, no account details in the reply, handed off to Security",
      reason: expertQuote(
        "Someone changed my email and now they want a refund? That's a takeover. I stop, I don't send anything, Security takes it.",
        "seg_051",
        467_000,
        "think_aloud",
      ),
      guardrailIds: ["G3"],
      judgmentCall: true,
    },
    {
      id: "S6",
      order: 6,
      title: "Lawyer or GDPR means stop replying and hand to Legal",
      moment: moment(690_000, "f_0690", 4_000, 8_000),
      decision: "Legal handoff for any lawyer mention or data-deletion request",
      reason: expertQuote(
        "The moment someone says lawyer or GDPR I stop writing. That goes to Legal, I don't even acknowledge it myself.",
        "seg_077",
        694_000,
        "debrief",
      ),
      guardrailIds: ["G4"],
      judgmentCall: false,
    },
  ],
  guardrails: [
    {
      id: "G1",
      type: "limit",
      condition: "refund above 100 EUR",
      action: "needs a second approval before it is sent",
      evidence: {
        quote: expertQuote(
          "Anything over a hundred I need a second pair of eyes on.",
          "seg_021",
          193_000,
          "live_question",
        ),
        moment: moment(185_000, "f_0185"),
      },
      machineRule: {
        when: { action: "refund", amountEurAbove: 100 },
        effect: "REQUIRE_APPROVAL",
      },
    },
    {
      id: "G2",
      type: "never",
      condition: "customer has an open chargeback",
      action: "never refund; route to Billing disputes",
      evidence: {
        quote: expertQuote(
          "Never refund with an open chargeback, we'd pay twice.",
          "seg_034",
          318_000,
          "live_question",
        ),
        moment: moment(310_000, "f_0310"),
      },
      machineRule: {
        when: { action: "refund", anyTag: ["chargeback-open"] },
        effect: "BLOCK",
        expectedOutcome: "handoff_billing_disputes",
      },
    },
    {
      id: "G3",
      type: "stop_and_ask",
      condition: "signs of account takeover (changed email, logins the customer denies)",
      action: "stop; no refund, no account details in the reply; route to Security",
      evidence: {
        quote: expertQuote(
          "I stop, I don't send anything, Security takes it.",
          "seg_051",
          470_000,
          "think_aloud",
        ),
        moment: moment(460_000, "f_0460"),
      },
      machineRule: {
        when: { bodyMatchesAny: ["changed my email", "wasn't me", "hacked"] },
        effect: "BLOCK",
        expectedOutcome: "handoff_security",
      },
    },
    {
      id: "G4",
      type: "stop_and_ask",
      condition: "customer mentions a lawyer, legal action or GDPR",
      action: "stop replying; route to Legal",
      evidence: {
        quote: expertQuote(
          "The moment someone says lawyer or GDPR I stop writing. That goes to Legal",
          "seg_077",
          694_000,
          "debrief",
        ),
        moment: moment(690_000, "f_0690", 4_000, 8_000),
      },
      machineRule: {
        when: { bodyMatchesAny: ["lawyer", "legal action", "gdpr", "delete all my data"] },
        effect: "BLOCK",
        expectedOutcome: "handoff_legal",
      },
    },
  ],
  openQuestions: [
    {
      id: "Q1",
      aboutStepId: "S3",
      slot: "exception",
      text: "Does the 100 EUR approval limit also apply to credits on annual plans?",
      priority: 0.55,
    },
    {
      id: "Q2",
      slot: "escalation_contact",
      text: "Who in Security picks up a takeover handoff outside office hours?",
      priority: 0.35,
    },
  ],
  offRecordSpans: [[540_000, 600_000]],
  coverage: 0.92,
  teachBackConfirmedAtMs: 765_000,
};
