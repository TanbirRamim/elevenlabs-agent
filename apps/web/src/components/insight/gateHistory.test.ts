import { describe, expect, it } from "vitest";
import {
  EMPTY_GATE_HISTORY,
  type GateHistory,
  type GateSample,
  liveTimelineEnd,
  MAX_INSTANTS,
  recordGateSample,
} from "./gateHistory";

const base: GateSample = {
  nowMs: 0,
  lastUserSpeechMs: null,
  lastInputActivityMs: null,
  lastScreenChangeMs: null,
  agentSpeaking: false,
  offRecord: false,
  candidate: null,
  decision: { open: false, reason: "no_candidate" },
  asked: [],
};

const run = (samples: Partial<GateSample>[]): GateHistory =>
  samples.reduce<GateHistory>((h, s) => recordGateSample(h, { ...base, ...s }), EMPTY_GATE_HISTORY);

const candidate = {
  id: "c1",
  text: "Why Security on T4?",
  createdAtMs: 9_000,
  slot: "reason" as const,
  aboutTicketId: "T4",
};

describe("recordGateSample", () => {
  it("joins close speech signals into one span and splits on a pause", () => {
    const h = run([
      { nowMs: 1_000, lastUserSpeechMs: 1_000 },
      { nowMs: 1_250, lastUserSpeechMs: 1_250 },
      { nowMs: 1_500, lastUserSpeechMs: 1_500 },
      { nowMs: 5_000, lastUserSpeechMs: 5_000 },
    ]);
    expect(h.speech).toEqual([
      { startMs: 1_000, endMs: 1_500 },
      { startMs: 5_000, endMs: 5_000 },
    ]);
  });

  it("records typing and screen instants only when they change", () => {
    const h = run([
      { nowMs: 1_000, lastInputActivityMs: 900, lastScreenChangeMs: 800 },
      { nowMs: 1_250, lastInputActivityMs: 900, lastScreenChangeMs: 800 },
      { nowMs: 1_500, lastInputActivityMs: 1_400, lastScreenChangeMs: 800 },
    ]);
    expect(h.typing).toEqual([900, 1_400]);
    expect(h.screen).toEqual([800]);
  });

  it("caps instants so a long session stays bounded", () => {
    let h = EMPTY_GATE_HISTORY;
    for (let i = 1; i <= MAX_INSTANTS + 5; i++) {
      h = recordGateSample(h, { ...base, nowMs: i, lastInputActivityMs: i });
    }
    expect(h.typing).toHaveLength(MAX_INSTANTS);
    expect(h.typing[0]).toBe(6);
  });

  it("opens and extends asking and off-the-record spans", () => {
    const h = run([
      { nowMs: 1_000, agentSpeaking: true },
      { nowMs: 1_250, agentSpeaking: true },
      { nowMs: 1_500, agentSpeaking: false, offRecord: true },
      { nowMs: 4_000, offRecord: true },
      { nowMs: 4_250, offRecord: false },
    ]);
    expect(h.asking).toEqual([{ startMs: 1_000, endMs: 1_250 }]);
    expect(h.offRecord).toEqual([{ startMs: 1_500, endMs: 4_000 }]);
  });

  it("keeps the reasons the gate held a question and attaches them when it is asked", () => {
    const h = run([
      { nowMs: 10_000, candidate, decision: { open: false, reason: "user_typing" } },
      { nowMs: 10_250, candidate, decision: { open: false, reason: "user_typing" } },
      { nowMs: 11_000, candidate, decision: { open: false, reason: "screen_changing" } },
      {
        nowMs: 12_000,
        candidate: null,
        decision: { open: true },
        asked: [
          {
            id: "c1",
            text: candidate.text,
            atMs: 12_000,
            pauseMs: { silence: 4_000, inputIdle: 3_100, screenIdle: null },
          },
        ],
      },
    ]);
    expect(h.questions).toEqual([
      {
        id: "c1",
        atMs: 12_000,
        text: candidate.text,
        slot: "reason",
        ticketId: "T4",
        readyAtMs: 9_000,
        heldBy: ["Expert is typing", "Screen is still changing"],
        pause: { silenceMs: 4_000, inputIdleMs: 3_100, screenIdleMs: null },
      },
    ]);
    expect(h.held).toBeNull();
  });

  it("marks a held question as dropped when a newer one replaces it", () => {
    const h = run([
      { nowMs: 10_000, candidate, decision: { open: false, reason: "too_soon" } },
      {
        nowMs: 20_000,
        candidate: { ...candidate, id: "c2", text: "Next?", createdAtMs: 19_500 },
        decision: { open: false, reason: "too_soon" },
      },
    ]);
    expect(h.dropped).toEqual([
      {
        id: "c1",
        atMs: 20_000,
        text: candidate.text,
        reason: "Replaced by a newer question",
        readyAtMs: 9_000,
      },
    ]);
    expect(h.held?.id).toBe("c2");
  });

  it("says a question went stale when that was the last reason it was held", () => {
    const h = run([
      { nowMs: 30_000, candidate, decision: { open: false, reason: "stale_candidate" } },
      {
        nowMs: 31_000,
        candidate: { ...candidate, id: "c2", createdAtMs: 30_500 },
        decision: { open: false, reason: "user_speaking" },
      },
    ]);
    expect(h.dropped[0]?.reason).toBe("Out of date before a pause came");
  });
});

describe("liveTimelineEnd", () => {
  it("shows at least two minutes and keeps headroom after now", () => {
    expect(liveTimelineEnd(0)).toBe(120_000);
    expect(liveTimelineEnd(110_000)).toBe(180_000);
    expect(liveTimelineEnd(200_000)).toBe(240_000);
  });
});
