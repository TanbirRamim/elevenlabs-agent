import { loadTickets } from "@shadow/guard/fixtures";
import { PublicTicket, type ServerMessage } from "@shadow/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "../store/memory.js";
import { type CuriosityDeps, createCuriosityEngine } from "./engine.js";

const ticketsById = new Map(loadTickets().map((t) => [t.id, PublicTicket.parse(t)]));
const log = { warn: vi.fn() };

function setup(over: Partial<CuriosityDeps> = {}) {
  const session = createMemoryStore().createSession("capture");
  const sent: ServerMessage[] = [];
  const engine = createCuriosityEngine({
    session,
    send: (m) => sent.push(m),
    llm: null,
    ticketsById,
    screenAnswers: () => [],
    log,
    phrase: async (gap) => `What is the rule behind your ${gap.slot} on ${gap.ticketId}?`,
    ...over,
  });
  return { session, sent, engine };
}

function candidates(sent: ServerMessage[]) {
  return sent.filter(
    (m): m is Extract<ServerMessage, { type: "candidate_question" }> =>
      m.type === "candidate_question",
  );
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe("curiosity engine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a T3 decision produces a guardrail candidate >= 0.6 naming the ticket", async () => {
    const { sent, engine } = setup();
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 10_000,
      ticketId: "T3",
      outcome: "handoff_billing_disputes",
    });
    await flush();
    const cs = candidates(sent);
    expect(cs).toHaveLength(1);
    expect(cs[0]?.question).toMatchObject({ slot: "guardrail", aboutTicketId: "T3" });
    expect(cs[0]?.question.priority).toBeGreaterThanOrEqual(0.6);
    expect(cs[0]?.question.text).toContain("T3");
    engine.stop();
  });

  it("an expert answer within 30 s fills the slot; a later one does not", async () => {
    const { sent, engine } = setup();
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 10_000,
      ticketId: "T3",
      outcome: "handoff_billing_disputes",
    });
    await flush();
    const q = candidates(sent)[0]?.question;
    if (!q) throw new Error("no candidate");
    engine.onQuestionAsked(q.id, 12_000);

    engine.onTranscript({
      id: "seg_a",
      tStartMs: 20_000,
      tEndMs: 24_000,
      speaker: "expert",
      text: "Never refund with an open chargeback, we'd pay twice.",
      offRecord: false,
    });
    const answered = engine.answeredQuestions();
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({ ticketId: "T3", slot: "guardrail" });
    expect(answered[0]?.answerSegmentIds).toEqual(["seg_a"]);

    // outside the window: does not attach to the (already answered) gap set again
    engine.onTranscript({
      id: "seg_late",
      tStartMs: 50_000,
      tEndMs: 51_000,
      speaker: "expert",
      text: "unrelated remark",
      offRecord: false,
    });
    expect(engine.answeredQuestions()[0]?.answerSegmentIds).toEqual(["seg_a"]);
    engine.stop();
  });

  it("never proposes a gap whose answer is visible on screen", async () => {
    const { sent, engine } = setup({
      screenAnswers: () => [
        "T3 banner: never refund while a chargeback is open",
        "T3 reason shown: because the bank already holds the money",
        "T3 exception note: unless billing disputes approves",
        "T3 escalation: reach billing disputes via #disputes",
      ],
    });
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 10_000,
      ticketId: "T3",
      outcome: "handoff_billing_disputes",
    });
    await flush();
    expect(candidates(sent)).toHaveLength(0);
    engine.stop();
  });

  it("decayed unanswered gaps move to the debrief queue (once the live quota is met)", () => {
    const { engine } = setup({ liveQuota: 0 });
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 0,
      ticketId: "T1",
      outcome: "reply",
    });
    // 61 s later the session clock has moved past the decay horizon
    engine.onDeskEvent({ type: "input_activity", tMs: 61_000 });
    expect(engine.openGapCount()).toBe(0);
    expect(engine.debriefQueue().length).toBeGreaterThan(0);
    engine.stop();
  });

  it("a vision decision with no DOM action opens a hypothesis for the open ticket", async () => {
    const { sent, engine } = setup();
    engine.onDeskEvent({ type: "ticket_opened", tMs: 1000, ticketId: "T2" });
    engine.onVisionDecision(8000);
    await flush();
    const cs = candidates(sent);
    expect(cs.length).toBeGreaterThan(0);
    expect(cs[0]?.question.aboutTicketId).toBe("T2");
    engine.stop();
  });

  it("a newer top gap replaces the candidate; sub-threshold gaps never send one", async () => {
    const { sent, engine } = setup({ liveQuota: 0 });
    // T1 reply is unsurprising: guardrail priority 0.5 < 0.6, no candidate.
    engine.onDeskEvent({ type: "action_committed", tMs: 0, ticketId: "T1", outcome: "reply" });
    await flush();
    expect(candidates(sent)).toHaveLength(0);

    engine.onDeskEvent({
      type: "action_committed",
      tMs: 1000,
      ticketId: "T3",
      outcome: "handoff_billing_disputes",
    });
    await flush();
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 6000,
      ticketId: "T4",
      outcome: "handoff_security",
    });
    await flush();
    const cs = candidates(sent);
    expect(cs).toHaveLength(2);
    expect(cs[0]?.question.aboutTicketId).toBe("T3");
    expect(cs[1]?.question.aboutTicketId).toBe("T4"); // fresher gap took over
    engine.stop();
  });
});

describe("curiosity engine minimum coverage (until 3 questions are asked live)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a T1 reply (priority 0.5) still yields an on-screen guardrail candidate", async () => {
    const { sent, engine } = setup();
    engine.onDeskEvent({ type: "action_committed", tMs: 5000, ticketId: "T1", outcome: "reply" });
    await flush();
    const q = candidates(sent)[0]?.question;
    expect(q).toMatchObject({ slot: "guardrail", aboutTicketId: "T1" });
    expect(q?.priority).toBeGreaterThanOrEqual(0.2);
    engine.stop();
  });

  it("after a ticket was asked, the next candidate is about another decided ticket", async () => {
    const { sent, engine } = setup();
    engine.onDeskEvent({ type: "action_committed", tMs: 5000, ticketId: "T1", outcome: "reply" });
    await flush();
    const q1 = candidates(sent)[0]?.question;
    if (!q1) throw new Error("no candidate");
    engine.onQuestionAsked(q1.id, 8000);
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 30_000,
      ticketId: "T2",
      outcome: "refund",
    });
    await flush();
    const q2 = candidates(sent)[1]?.question;
    expect(q2).toMatchObject({ aboutTicketId: "T2", slot: "guardrail" });
    engine.stop();
  });

  it("never offers a gap the screen already answers, even when behind", async () => {
    const { sent, engine } = setup({
      screenAnswers: () => [
        "T1 banner: never resend to an unverified email (rule)",
        "T1 reason shown: because the account looks normal",
        "T1 exception note: unless the invoice is wrong",
      ],
    });
    engine.onDeskEvent({ type: "action_committed", tMs: 5000, ticketId: "T1", outcome: "reply" });
    await flush();
    expect(candidates(sent)).toHaveLength(0);
    engine.stop();
  });

  it("re-offers an unasked candidate with a fresh time when the expert talked through it", async () => {
    const { sent, engine } = setup();
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 10_000,
      ticketId: "T3",
      outcome: "handoff_billing_disputes",
    });
    await flush();
    engine.onTranscript({
      id: "seg_talk",
      tStartMs: 38_000,
      tEndMs: 40_000,
      speaker: "expert",
      text: "Let me pull up the next one.",
      offRecord: false,
    });
    await flush();
    const cs = candidates(sent);
    expect(cs).toHaveLength(2);
    expect(cs[1]?.question.id).toBe(cs[0]?.question.id);
    expect(cs[1]?.question.createdAtMs).toBe(40_000);
    engine.stop();
  });

  it("does not decay gaps before the quota; unasked ones lead the debrief queue", () => {
    const { session, engine } = setup();
    engine.onDeskEvent({ type: "action_committed", tMs: 0, ticketId: "T1", outcome: "reply" });
    engine.onDeskEvent({ type: "input_activity", tMs: 61_000 });
    expect(engine.openGapCount()).toBeGreaterThan(0);
    const front = [...session.debriefQueue].sort((a, b) => b.priority - a.priority)[0];
    expect(front?.priority).toBeGreaterThanOrEqual(0.9);
    expect(front?.text).toContain("T1");
    expect(front?.slot).toBe("guardrail");
    engine.stop();
  });

  it("a shortfall question the debrief answered is never re-queued", async () => {
    const { session, engine } = setup();
    engine.onDeskEvent({ type: "action_committed", tMs: 0, ticketId: "T1", outcome: "reply" });
    await flush();
    engine.onDeskEvent({ type: "input_activity", tMs: 61_000 });
    const front = session.debriefQueue.find((q) => q.priority >= 0.9);
    if (!front) throw new Error("no shortfall");
    // debrief.ts removes an answered question from the queue
    session.debriefQueue = session.debriefQueue.filter((q) => q.id !== front.id);
    engine.onTranscript({
      id: "seg_debrief",
      tStartMs: 62_000,
      tEndMs: 63_000,
      speaker: "expert",
      text: "Only if the invoice itself is wrong would I loop in billing.",
      offRecord: false,
    });
    await flush();
    expect(session.debriefQueue.some((q) => q.id === front.id)).toBe(false);
    engine.stop();
  });

  it("a question asked live leaves the debrief shortfall; 3 asked restores the 0.6 bar", async () => {
    const { session, sent, engine } = setup();
    const decide = async (tMs: number, ticketId: string, outcome: "reply" | "refund") => {
      engine.onDeskEvent({ type: "action_committed", tMs, ticketId, outcome });
      await flush();
      const q = candidates(sent).at(-1)?.question;
      if (!q || q.aboutTicketId !== ticketId) throw new Error(`no candidate for ${ticketId}`);
      engine.onQuestionAsked(q.id, tMs + 3000);
      expect(session.debriefQueue.some((d) => d.text === q.text && d.priority >= 0.9)).toBe(false);
    };
    await decide(5000, "T1", "reply");
    await decide(25_000, "T2", "refund");
    await decide(45_000, "T5", "reply");
    expect(session.debriefQueue.filter((d) => d.priority >= 0.9)).toHaveLength(0);
    const before = candidates(sent).length;
    engine.onDeskEvent({ type: "action_committed", tMs: 65_000, ticketId: "T6", outcome: "reply" });
    await flush();
    expect(candidates(sent)).toHaveLength(before); // unsurprising reply: below 0.6 again
    engine.stop();
  });
});

describe("curiosity engine with vision + desk signals", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("the same decision seen by vision and DOM opens one set of gaps", async () => {
    const { sent, engine } = setup();
    engine.onDeskEvent({
      type: "action_committed",
      tMs: 10_000,
      ticketId: "T3",
      outcome: "handoff_billing_disputes",
    });
    engine.onVisionEvent(
      { kind: "action", object: "ticket T3", to: "handoff billing disputes" },
      11_000,
    );
    await flush();
    expect(engine.openGapCount()).toBe(4); // guardrail, reason, exception, contact
    expect(candidates(sent)).toHaveLength(1);
    engine.stop();
  });
});
