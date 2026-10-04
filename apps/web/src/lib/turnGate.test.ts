import { describe, expect, it } from "vitest";
import { decide, type GateSignals } from "./turnGate";

const quiet = (over: Partial<GateSignals> = {}): GateSignals => ({
  nowMs: 300_000,
  lastUserSpeechMs: 290_000,
  lastInputActivityMs: 290_000,
  lastScreenChangeMs: 290_000,
  agentSpeaking: false,
  offRecord: false,
  questionsAskedMs: [],
  candidate: { priority: 0.8, createdAtMs: 295_000 },
  ...over,
});

describe("turn gate", () => {
  it("opens at a real pause with a good candidate", () => {
    expect(decide(quiet())).toEqual({ open: true });
  });
  it("stays quiet while the expert talks", () => {
    expect(decide(quiet({ lastUserSpeechMs: 299_500 }))).toMatchObject({ reason: "user_speaking" });
  });
  it("stays quiet while the expert types", () => {
    expect(decide(quiet({ lastInputActivityMs: 299_000 }))).toMatchObject({
      reason: "user_typing",
    });
  });
  it("stays quiet while the screen is changing (reading/scrolling)", () => {
    expect(decide(quiet({ lastScreenChangeMs: 299_000 }))).toMatchObject({
      reason: "screen_changing",
    });
  });
  it("never speaks off the record", () => {
    expect(decide(quiet({ offRecord: true }))).toMatchObject({ reason: "off_record" });
  });
  it("respects the 30 s gap and the 5-per-10-minutes budget", () => {
    expect(decide(quiet({ questionsAskedMs: [280_000] }))).toMatchObject({ reason: "too_soon" });
    expect(decide(quiet({ questionsAskedMs: [270_000] }))).toEqual({ open: true });
    const five = [0, 100_000, 120_000, 140_000, 160_000];
    expect(decide(quiet({ questionsAskedMs: five }))).toMatchObject({ reason: "budget_spent" });
  });
  it("reaches 3 questions at the demo's pace (a ticket every ~40 s, each asked 3 s after)", () => {
    // Regression: with a 90 s gap, the 2nd and 3rd candidates went stale while "too soon".
    const asked: number[] = [];
    for (const commitMs of [40_000, 80_000, 120_000, 160_000]) {
      const candidate = { priority: 0.8, createdAtMs: commitMs + 3000 };
      const nowMs = commitMs + 6500; // 3.5 s of quiet after the candidate arrived
      const quietMs = commitMs + 500;
      const d = decide({
        nowMs,
        lastUserSpeechMs: quietMs,
        lastInputActivityMs: quietMs,
        lastScreenChangeMs: quietMs,
        agentSpeaking: false,
        offRecord: false,
        questionsAskedMs: asked,
        candidate,
      });
      if (d.open) asked.push(nowMs);
    }
    expect(asked.length).toBeGreaterThanOrEqual(3);
  });
  it("drops stale or weak candidates to the debrief", () => {
    expect(decide(quiet({ candidate: { priority: 0.3, createdAtMs: 295_000 } }))).toMatchObject({
      reason: "low_priority",
    });
    expect(decide(quiet({ candidate: { priority: 0.9, createdAtMs: 200_000 } }))).toMatchObject({
      reason: "stale_candidate",
    });
  });
});
