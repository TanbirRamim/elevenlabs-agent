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
  it("respects the 30 s gap and the 5-per-10-minutes budget once 3 questions are in", () => {
    const met = [100_000, 150_000];
    expect(decide(quiet({ questionsAskedMs: [...met, 280_000] }))).toMatchObject({
      reason: "too_soon",
    });
    expect(decide(quiet({ questionsAskedMs: [...met, 270_000] }))).toEqual({ open: true });
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
    const met = [100_000, 150_000, 200_000];
    expect(
      decide(quiet({ questionsAskedMs: met, candidate: { priority: 0.3, createdAtMs: 295_000 } })),
    ).toMatchObject({ reason: "low_priority" });
    expect(decide(quiet({ candidate: { priority: 0.9, createdAtMs: 200_000 } }))).toMatchObject({
      reason: "stale_candidate",
    });
  });
});

describe("turn gate minimum coverage (until 3 questions are asked)", () => {
  it("accepts a weaker on-screen candidate while behind the quota", () => {
    expect(decide(quiet({ candidate: { priority: 0.3, createdAtMs: 295_000 } }))).toEqual({
      open: true,
    });
    expect(decide(quiet({ candidate: { priority: 0.1, createdAtMs: 295_000 } }))).toMatchObject({
      reason: "low_priority",
    });
  });
  it("needs only 15 s between questions while behind, never under 15 s", () => {
    expect(decide(quiet({ questionsAskedMs: [284_000] }))).toEqual({ open: true });
    expect(decide(quiet({ questionsAskedMs: [287_000] }))).toMatchObject({ reason: "too_soon" });
  });
  it("keeps a candidate alive for 45 s while behind (the expert may talk through a pause)", () => {
    expect(decide(quiet({ candidate: { priority: 0.8, createdAtMs: 260_000 } }))).toEqual({
      open: true,
    });
    expect(decide(quiet({ candidate: { priority: 0.8, createdAtMs: 250_000 } }))).toMatchObject({
      reason: "stale_candidate",
    });
  });
  it("still never asks while the expert speaks or types, even when behind", () => {
    expect(decide(quiet({ lastUserSpeechMs: 299_000 }))).toMatchObject({ reason: "user_speaking" });
    expect(decide(quiet({ lastInputActivityMs: 299_500 }))).toMatchObject({
      reason: "user_typing",
    });
  });
  it("never relaxes the screen pause, even when behind", () => {
    expect(decide(quiet({ lastScreenChangeMs: 298_200 }))).toMatchObject({
      reason: "screen_changing",
    });
  });
  it("a talking expert with 1.8 s breaths still gets 3 questions in a 4-ticket session", () => {
    // Speech every 1.8 s pause; one candidate per decided ticket every ~35 s.
    const asked: number[] = [];
    let candidate: { priority: number; createdAtMs: number } | null = null;
    for (let nowMs = 0; nowMs < 180_000; nowMs += 250) {
      const commit = [30_000, 65_000, 100_000, 135_000].find(
        (c) => nowMs >= c + 4000 && nowMs < c + 4250,
      );
      if (commit !== undefined) candidate = { priority: 0.45, createdAtMs: commit + 4000 };
      // 4 s of speech, 1.8 s of breath, repeating.
      const phase = nowMs % 5800;
      const lastUserSpeechMs = phase < 4000 ? nowMs : nowMs - (phase - 4000);
      const d = decide({
        nowMs,
        lastUserSpeechMs,
        lastInputActivityMs: commit ?? 0,
        lastScreenChangeMs: 0,
        agentSpeaking: false,
        offRecord: false,
        questionsAskedMs: asked,
        candidate,
      });
      if (d.open && candidate) {
        asked.push(nowMs);
        candidate = null;
      }
    }
    expect(asked.length).toBeGreaterThanOrEqual(3);
  });
});
