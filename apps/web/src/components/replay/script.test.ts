import { describe, expect, it } from "vitest";
import { DEFAULT_GATE, decide } from "../../lib/turnGate";
import { sampleWorkMap } from "../workmap/fixture";
import {
  captureAt,
  chapterAt,
  clockAt,
  mapAt,
  momentsOf,
  orbStateAt,
  snapToMoment,
  teachAt,
  transcriptAt,
} from "./frame";
import { buildReplayScript, captureSignalsAt, playToSession, sessionToPlay } from "./script";

const script = buildReplayScript();

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}
const { capture } = script;

describe("replay script: live questions come from the real Turn Gate", () => {
  it("asks at least three questions, at least one about a guardrail", () => {
    expect(capture.asked.length).toBeGreaterThanOrEqual(3);
    expect(capture.asked.some((q) => q.slot === "guardrail")).toBe(true);
  });

  it("asks each question only at a moment decide() opens", () => {
    for (const q of capture.asked) {
      // The inputs decide() saw at the ask, re-run through the real gate.
      expect(q.signals.nowMs).toBe(q.atMs);
      expect(decide(q.signals)).toEqual({ open: true });
      // They match the recorded session at that instant (asking itself only adds Shadow's speech).
      const { signals } = captureSignalsAt(capture, q.atMs);
      expect({ ...signals, agentSpeaking: false }).toEqual({
        ...q.signals,
        candidate: signals.candidate,
      });
      expect(signals.agentSpeaking).toBe(true);
    }
  });

  it("never lets the gate open while a question is held, until it is asked", () => {
    for (const q of capture.asked) {
      for (let t = q.createdAtMs; t < q.atMs; t += 100) {
        expect(captureSignalsAt(capture, t).decision.open).toBe(false);
      }
      expect(q.heldBy.length).toBeGreaterThan(0);
    }
  });

  it("each question meets the gate's pause thresholds and spacing", () => {
    for (const q of capture.asked) {
      if (q.pause.silenceMs !== null)
        expect(q.pause.silenceMs).toBeGreaterThanOrEqual(DEFAULT_GATE.silenceMs);
      if (q.pause.inputIdleMs !== null)
        expect(q.pause.inputIdleMs).toBeGreaterThanOrEqual(DEFAULT_GATE.inputIdleMs);
      if (q.pause.screenIdleMs !== null)
        expect(q.pause.screenIdleMs).toBeGreaterThanOrEqual(DEFAULT_GATE.screenIdleMs);
    }
    const times = capture.asked.map((q) => q.atMs);
    for (let i = 1; i < times.length; i++) {
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(DEFAULT_GATE.minGapMs);
    }
  });

  it("asks nothing off the record, and drops the question Maya answered unprompted", () => {
    for (const q of capture.asked) {
      for (const o of capture.offRecord)
        expect(q.atMs >= o.startMs && q.atMs < o.endMs).toBe(false);
    }
    expect(capture.dropped.map((d) => d.ticketId)).toEqual(["T1"]);
  });

  it("is deterministic", () => {
    expect(buildReplayScript()).toEqual(script);
  });
});

describe("replay script: timeline", () => {
  it("chapters are contiguous, in order, and cover the whole replay (about 90 s)", () => {
    expect(script.chapters.map((c) => c.id)).toEqual(["capture", "map", "teach", "agents"]);
    expect(script.chapters[0]?.startMs).toBe(0);
    for (let i = 1; i < script.chapters.length; i++) {
      expect(script.chapters[i]?.startMs).toBe(script.chapters[i - 1]?.endMs);
    }
    expect(script.chapters.at(-1)?.endMs).toBe(script.durationMs);
    expect(script.durationMs).toBeGreaterThanOrEqual(85_000);
    expect(script.durationMs).toBeLessThanOrEqual(95_000);
  });

  it("captions are monotonic and well formed", () => {
    let last = -1;
    for (const c of script.captions) {
      expect(c.startMs).toBeGreaterThanOrEqual(last);
      expect(c.endMs).toBeGreaterThanOrEqual(c.startMs);
      expect(c.endMs).toBeLessThanOrEqual(script.durationMs);
      last = c.startMs;
    }
  });

  it("the time-lapse map is monotonic both ways and round-trips", () => {
    let prev = -1;
    for (const s of script.segments) {
      expect(s.sessionEndMs).toBeGreaterThan(s.sessionStartMs);
      expect(s.playEndMs).toBeGreaterThan(s.playStartMs);
      expect(s.playStartMs).toBeGreaterThan(prev);
      prev = s.playStartMs;
    }
    for (let p = 0; p < must(script.chapters[0], "capture chapter").endMs; p += 250) {
      expect(sessionToPlay(script.segments, playToSession(script.segments, p))).toBeCloseTo(p, 3);
    }
  });

  it("shows each live question near real time, never in a blur", () => {
    for (const q of capture.asked) {
      const seg = script.segments.find(
        (s) => q.atMs >= s.sessionStartMs && q.atMs <= s.sessionEndMs,
      );
      if (!seg) throw new Error("question outside the capture segments");
      expect(
        (seg.sessionEndMs - seg.sessionStartMs) / (seg.playEndMs - seg.playStartMs),
      ).toBeLessThanOrEqual(4);
    }
  });

  it("quotes Maya from the sample Work Map verbatim: every step and every guardrail", () => {
    const mayaLines = new Set(
      script.captions.filter((c) => c.speaker === "maya").map((c) => c.text),
    );
    for (const step of sampleWorkMap.steps) expect(mayaLines).toContain(step.reason.text);
    for (const g of sampleWorkMap.guardrails) expect(mayaLines).toContain(g.evidence.quote.text);
  });

  it("has Maya say each quote at the session time the sample Work Map cites", () => {
    const quotes = [
      ...sampleWorkMap.steps.map((s) => s.reason),
      ...sampleWorkMap.guardrails.map((g) => g.evidence.quote),
    ];
    // Captions are rounded to whole playback ms; allow for that once mapped to session time.
    const roundingMs = 50;
    for (const q of quotes) {
      const said = script.captions.filter((c) => c.speaker === "maya" && c.text === q.text);
      const atSessionTime = said.some((c) => {
        const from = clockAt(script, c.startMs)?.ms ?? Number.NaN;
        const to = clockAt(script, c.endMs - 1)?.ms ?? Number.NaN;
        return q.tMs >= from - roundingMs && q.tMs <= to + roundingMs;
      });
      expect(atSessionTime, `${q.segmentId} at ${q.tMs} ms`).toBe(true);
    }
    for (const [start, end] of sampleWorkMap.offRecordSpans) {
      expect(capture.offRecord).toContainEqual({ startMs: start, endMs: end });
    }
  });
});

describe("replay frames", () => {
  it("orb follows the session: asking during a question, off the record in the gap", () => {
    const q = must(capture.asked[0], "first question");
    expect(orbStateAt(script, sessionToPlay(script.segments, q.atMs + 500))).toBe("speaking");
    const off = must(capture.offRecord[0], "off-record span");
    expect(orbStateAt(script, sessionToPlay(script.segments, off.startMs + 5_000))).toBe(
      "off-record",
    );
  });

  it("holds the T3 question while Maya types, then asks it", () => {
    const q = must(
      capture.asked.find((x) => x.ticketId === "T3"),
      "T3 question",
    );
    const before = captureAt(script, sessionToPlay(script.segments, q.createdAtMs + 2_000));
    expect(before.holding?.ticketId).toBe("T3");
    expect(before.decision).toEqual({ open: false, reason: "user_typing" });
    const during = captureAt(script, sessionToPlay(script.segments, q.atMs + 100));
    expect(during.asking?.id).toBe(q.id);
  });

  it("map ends confirmed at the Work Map's time with coverage over the target", () => {
    const end = mapAt(script, must(script.chapters[1], "map chapter").endMs - 1);
    expect(end.done).toBe(true);
    const lastQuoteMs = Math.max(...sampleWorkMap.guardrails.map((g) => g.evidence.quote.tMs));
    expect(end.teachBack?.confirmedSessionMs).toBeGreaterThan(lastQuoteMs);
    expect(end.coverage).toBe(sampleWorkMap.coverage);
    expect(end.gaps.every((g) => g.status === "answered")).toBe(true);
  });

  it("teach pauses the wrong refund on N1 before it is saved, then reroutes", () => {
    const t = script.teach;
    const paused = teachAt(script, t.blockedAtMs + 100);
    expect(paused.desk.phase).toBe("blocked");
    expect(paused.desk.committed.N1).toBeUndefined();
    const after = teachAt(script, t.pressRerouteAtMs + 100);
    expect(after.desk.committed.N1).toBe("handoff_security");
    expect(chapterAt(script, t.blockedAtMs).id).toBe("teach");
  });

  it("story mode: the first Shadow question is on screen within 8 s of load", () => {
    const q = must(capture.asked[0], "first question");
    expect(sessionToPlay(script.segments, q.atMs)).toBeLessThanOrEqual(8_000);
    expect(captureAt(script, sessionToPlay(script.segments, q.atMs) + 100).asking?.id).toBe(q.id);
  });

  it("teach predicts on N2 (G6 → Legal) and only intercepts on N1", () => {
    const t = script.teach;
    expect(t.predict).toMatchObject({ ticketId: "N2", guardrailId: "G6", chosen: "handoff_legal" });
    expect(t.predict.result.correct).toBe(true);
    const g6 = must(
      sampleWorkMap.guardrails.find((g) => g.id === "G6"),
      "G6",
    );
    expect(t.predict.result.reasonQuote).toBe(g6.evidence.quote.text);
    const asking = teachAt(script, t.predictAtMs + 100);
    expect(asking.desk.selectedId).toBe("N2");
    expect(asking.predict).toEqual({ chosen: null, revealed: false });
    expect(teachAt(script, t.predictResultAtMs + 100).predict?.revealed).toBe(true);
    const n1 = teachAt(script, t.openN1AtMs + 100);
    expect(n1.predict).toBeNull();
    expect(n1.desk.committed.N2).toBe("handoff_legal");
    expect(t.openN1AtMs).toBeGreaterThan(t.commitN2AtMs);
    expect(t.verdict.ruleIds).toEqual(["G4", "G1"]);
  });

  it("reduced motion snaps to whole moments and shows captions whole", () => {
    const moments = momentsOf(script);
    const t = 20_000;
    const snapped = snapToMoment(moments, t);
    expect(snapped).toBeLessThanOrEqual(t);
    const tr = transcriptAt(script, snapped, true);
    expect(tr.revealed).toBe(tr.current?.text.length ?? 0);
  });
});
