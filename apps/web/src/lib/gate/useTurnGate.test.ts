import { describe, expect, it } from "vitest";
import { decide } from "../turnGate";
import { type AskedQuestion, gateSignals, type TurnGateInputs } from "./useTurnGate";

const inputs = (over: Partial<TurnGateInputs> = {}): TurnGateInputs => ({
  enabled: true,
  clock: () => 300_000,
  lastUserSpeechMs: 290_000,
  lastInputActivityMs: 290_000,
  lastScreenChangeMs: 290_000,
  agentSpeaking: false,
  offRecord: false,
  candidate: {
    id: "q1",
    text: "You held the refund on T3. Was it the chargeback?",
    slot: "guardrail",
    priority: 0.8,
    aboutTicketId: "T3",
    createdAtMs: 295_000,
  },
  onOpen: () => {},
  ...over,
});

const asked = (atMs: number): AskedQuestion => ({
  id: `q${atMs}`,
  text: "earlier question",
  atMs,
  pauseMs: { silence: 2000, inputIdle: 3500, screenIdle: 3000 },
});

describe("gateSignals", () => {
  it("maps the session state into the pure gate's signals", () => {
    const s = gateSignals(inputs(), [asked(100_000)]);
    expect(s).toEqual({
      nowMs: 300_000,
      lastUserSpeechMs: 290_000,
      lastInputActivityMs: 290_000,
      lastScreenChangeMs: 290_000,
      agentSpeaking: false,
      offRecord: false,
      questionsAskedMs: [100_000],
      candidate: { priority: 0.8, createdAtMs: 295_000 },
    });
  });

  it("opens at a real pause and stays closed while off the record or without a candidate", () => {
    expect(decide(gateSignals(inputs(), []))).toEqual({ open: true });
    expect(decide(gateSignals(inputs({ offRecord: true }), []))).toMatchObject({
      reason: "off_record",
    });
    expect(decide(gateSignals(inputs({ candidate: null }), []))).toMatchObject({
      reason: "no_candidate",
    });
  });
});
