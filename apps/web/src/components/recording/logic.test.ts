import { describe, expect, it } from "vitest";
import {
  countdownReducer,
  formatElapsed,
  levelToSegments,
  processingProgress,
  summarizePreflight,
} from "./logic";

describe("formatElapsed", () => {
  it("formats minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(999)).toBe("00:00");
    expect(formatElapsed(61_000)).toBe("01:01");
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe("59:59");
  });
  it("adds hours past one hour", () => {
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_600_000 + 5 * 60_000 + 7_000)).toBe("1:05:07");
  });
  it("clamps negative and invalid input", () => {
    expect(formatElapsed(-5000)).toBe("00:00");
    expect(formatElapsed(Number.NaN)).toBe("00:00");
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("00:00");
  });
});

describe("levelToSegments", () => {
  it("maps a level to lit segments and clamps", () => {
    expect(levelToSegments(0, 12)).toBe(0);
    expect(levelToSegments(0.5, 12)).toBe(6);
    expect(levelToSegments(1, 12)).toBe(12);
    expect(levelToSegments(2, 12)).toBe(12);
    expect(levelToSegments(-1, 12)).toBe(0);
    expect(levelToSegments(Number.NaN, 12)).toBe(0);
    expect(levelToSegments(0.5, 0)).toBe(0);
  });
});

describe("summarizePreflight", () => {
  it("is ready only when every check is ok", () => {
    const s = summarizePreflight([
      { id: "mic", status: "ok" },
      { id: "screen", status: "ok" },
    ] as const);
    expect(s.ready).toBe(true);
    expect(s.blocking).toEqual([]);
  });
  it("counts and lists blocking checks in order", () => {
    const s = summarizePreflight([
      { id: "mic", status: "ok" },
      { id: "screen", status: "failed" },
      { id: "agent", status: "pending" },
      { id: "redaction", status: "ok" },
    ] as const);
    expect(s).toMatchObject({ ready: false, ok: 2, failed: 1, pending: 1, total: 4 });
    expect(s.blocking.map((b) => b.id)).toEqual(["screen", "agent"]);
  });
  it("is not ready with no checks", () => {
    expect(summarizePreflight([]).ready).toBe(false);
  });
});

describe("processingProgress", () => {
  it("counts done and skipped, finds the running and failed steps", () => {
    const p = processingProgress([
      { id: "transcript", status: "done" },
      { id: "redaction", status: "skipped" },
      { id: "workmap", status: "running" },
      { id: "verification", status: "waiting" },
    ] as const);
    expect(p).toMatchObject({ done: 2, total: 4, ratio: 0.5, complete: false });
    expect(p.current?.id).toBe("workmap");
    expect(p.failed).toBeUndefined();
  });
  it("reports a failure and completion", () => {
    expect(processingProgress([{ id: "a", status: "failed" }]).failed?.id).toBe("a");
    expect(processingProgress([{ id: "a", status: "done" }]).complete).toBe(true);
    expect(processingProgress([]).ratio).toBe(0);
  });
});

describe("countdownReducer", () => {
  it("ticks down to done and stays done", () => {
    let s = { remaining: 2, done: false };
    s = countdownReducer(s, { type: "tick" });
    expect(s).toEqual({ remaining: 1, done: false });
    s = countdownReducer(s, { type: "tick" });
    expect(s).toEqual({ remaining: 0, done: true });
    expect(countdownReducer(s, { type: "tick" })).toBe(s);
  });
  it("skips and resets", () => {
    expect(countdownReducer({ remaining: 3, done: false }, { type: "skip" })).toEqual({
      remaining: 0,
      done: true,
    });
    expect(countdownReducer({ remaining: 0, done: true }, { type: "reset", from: 3 })).toEqual({
      remaining: 3,
      done: false,
    });
  });
});
