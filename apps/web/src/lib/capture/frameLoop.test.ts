import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dhashFromGray } from "./dhash";
import { type SentFrame, startFrameLoop } from "./frameLoop";
import { type Frame, GRAY_COLS, GRAY_ROWS } from "./types";

/** Gray buffer where row `r` encodes the given byte as its 8 left<right bits. */
function grayFromRows(rows: number[]): Uint8ClampedArray {
  const g = new Uint8ClampedArray(GRAY_COLS * GRAY_ROWS);
  for (let r = 0; r < GRAY_ROWS; r++) {
    const bits = rows[r] ?? 0;
    let v = 128;
    g[r * GRAY_COLS] = v;
    for (let c = 0; c < GRAY_COLS - 1; c++) {
      const bit = (bits >> (7 - c)) & 1;
      v = bit ? v + 1 : v - 1;
      g[r * GRAY_COLS + c + 1] = v;
    }
  }
  return g;
}

const frame = (rows: number[]): Frame => ({
  jpegBase64: "AAAA",
  width: 1280,
  height: 720,
  gray: grayFromRows(rows),
});

const base = frame([]);
const oneBit = frame([0x01]); // distance 1 from base
const fiveBits = frame([0x1f]); // distance 5
const sixBits = frame([0x3f]); // distance 6
const far = frame([0xff, 0xff, 0xff]); // distance 24

/**
 * The change-filter tests turn the heartbeat off (`heartbeatMs: 0`) to look at the filter alone;
 * pass `null` to use the loop's default heartbeat.
 */
function setup(
  script: (Frame | null)[],
  threshold = 6,
  changeThreshold?: number,
  heartbeatMs: number | null = 0,
) {
  let now = 0;
  const sent: SentFrame[] = [];
  const changes: number[] = [];
  let i = 0;
  const loop = startFrameLoop({
    intervalMs: 1500,
    hammingThreshold: threshold,
    ...(changeThreshold !== undefined ? { changeThreshold } : {}),
    ...(heartbeatMs !== null ? { heartbeatMs } : {}),
    capture: () => {
      i++;
      return script[i - 1] ?? null;
    },
    onFrame: (f) => sent.push(f),
    onScreenChange: (t) => changes.push(t),
    clock: () => now,
  });
  // Step the session clock with the fake timers so each tick reads its own time.
  const advance = (ms: number) => {
    for (let left = ms; left > 0; left -= 1500) {
      now += 1500;
      vi.advanceTimersByTime(1500);
    }
  };
  return { loop, sent, changes, advance, calls: () => i };
}

describe("startFrameLoop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the first frame and nothing while the screen is identical", () => {
    const { loop, sent, changes, advance } = setup([base, base, base]);
    advance(1500 * 3);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ tMs: 1500, phash: dhashFromGray(base.gray), width: 1280 });
    expect(sent[0]?.frameId).toMatch(/^f1-[0-9a-f]{16}$/);
    expect(changes).toEqual([]);
    loop.stop();
  });

  it("reports small changes to the gate but only sends at the threshold", () => {
    const { loop, sent, changes, advance } = setup([base, oneBit, fiveBits, sixBits]);
    advance(1500 * 4);
    expect(changes).toEqual([3000, 4500, 6000]);
    expect(sent.map((f) => f.tMs)).toEqual([1500, 6000]);
    expect(sent[1]?.frameId).toMatch(/^f2-/);
    loop.stop();
  });

  it("ignores encoder flicker below changeThreshold but still reports real changes", () => {
    // A still desk over compressed video: the hash flickers by a bit or two every frame.
    const { loop, sent, changes, advance } = setup(
      [base, oneBit, base, oneBit, base, sixBits, sixBits],
      6,
      6,
    );
    advance(1500 * 7);
    expect(changes).toEqual([1500 * 6]);
    expect(sent.map((f) => f.tMs)).toEqual([1500, 1500 * 6]);
    loop.stop();
  });

  it("compares against the last SENT frame, not the last seen one", () => {
    // Each step is 1 bit from the previous, so a last-seen comparison would never send.
    const drift = [0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f].map((b) => frame([b]));
    const { loop, sent, advance } = setup([base, ...drift]);
    advance(1500 * 7);
    expect(sent.map((f) => f.tMs)).toEqual([1500, 1500 * 7]);
    loop.stop();
  });

  it("skips null captures", () => {
    const { loop, sent, changes, advance } = setup([null, null, base]);
    advance(1500 * 3);
    expect(sent.map((f) => f.tMs)).toEqual([4500]);
    expect(changes).toEqual([]);
    loop.stop();
  });

  it("captures nothing while paused and picks up again on resume", () => {
    const { loop, sent, calls, advance } = setup([base, far, far, far]);
    advance(1500);
    expect(calls()).toBe(1);
    loop.pause();
    advance(1500 * 3);
    expect(calls()).toBe(1);
    expect(sent).toHaveLength(1);
    loop.resume();
    advance(1500);
    expect(calls()).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.tMs).toBe(1500 * 5);
    loop.stop();
  });

  it("stops the timer on stop()", () => {
    const { loop, sent, advance } = setup([base, far, far]);
    advance(1500);
    loop.stop();
    advance(1500 * 5);
    expect(sent).toHaveLength(1);
  });

  it("uses injected timers when given", () => {
    const setInterval = vi.fn(() => 42);
    const clearInterval = vi.fn();
    const loop = startFrameLoop({
      intervalMs: 1500,
      hammingThreshold: 6,
      capture: () => null,
      onFrame: () => {},
      onScreenChange: () => {},
      clock: () => 0,
      timers: { setInterval, clearInterval },
    });
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1500);
    loop.stop();
    expect(clearInterval).toHaveBeenCalledWith(42);
  });

  it("sends a heartbeat frame on a still screen so no gap exceeds 2 s (default)", () => {
    // 1500 ms ticks: waiting for the next tick would leave a 3 s gap, so every tick sends.
    const { loop, sent, changes, advance } = setup([base, base, base, oneBit], 6, 6, null);
    advance(1500 * 4);
    expect(sent.map((f) => f.tMs)).toEqual([1500, 3000, 4500, 6000]);
    expect(sent.map((f) => f.frameId.split("-")[0])).toEqual(["f1", "f2", "f3", "f4"]);
    expect(changes).toEqual([]);
    loop.stop();
  });

  it("with fast ticks, sends a still screen once per heartbeat and changes at once", () => {
    let now = 0;
    const sent: number[] = [];
    const script = [base, base, base, base, base, far, far, far, far, far, far, far];
    let i = 0;
    const loop = startFrameLoop({
      intervalMs: 500,
      hammingThreshold: 6,
      heartbeatMs: 2000,
      capture: () => script[i++] ?? null,
      onFrame: (f) => sent.push(f.tMs),
      onScreenChange: () => {},
      clock: () => now,
    });
    for (let k = 0; k < script.length; k++) {
      now += 500;
      vi.advanceTimersByTime(500);
    }
    // First frame, a heartbeat 2000 ms later, the change at once at 3000, then a heartbeat
    // 2000 ms after it.
    expect(sent).toEqual([500, 2500, 3000, 5000]);
    for (let k = 1; k < sent.length; k++) {
      expect((sent[k] ?? 0) - (sent[k - 1] ?? 0)).toBeLessThanOrEqual(2000);
    }
    loop.stop();
  });
});
