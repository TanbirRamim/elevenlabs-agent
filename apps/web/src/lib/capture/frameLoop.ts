import { dhashFromGray, hamming } from "./dhash";
import type { Frame } from "./types";

/** A frame that passed the change filter and should be sent as a `frame` message. */
export interface SentFrame extends Frame {
  frameId: string;
  tMs: number;
  phash: string;
}

export interface Timers {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface FrameLoopOptions {
  intervalMs: number;
  /** Send a frame when the dHash distance from the last SENT frame is at least this. */
  hammingThreshold: number;
  capture: () => Frame | null;
  onFrame: (frame: SentFrame) => void;
  /** Any visible change (distance > 0), whether or not the frame is sent. Feeds the Turn Gate. */
  onScreenChange: (tMs: number) => void;
  /** Session clock in ms. */
  clock: () => number;
  timers?: Timers;
}

export interface FrameLoop {
  stop(): void;
  pause(): void;
  resume(): void;
  /** One capture step; also exposed for callers that want to force a frame. */
  tick(): void;
}

const defaultTimers: Timers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};

/**
 * Captures every `intervalMs`, hashes, and sends only frames that differ from the last sent one.
 * Pure apart from the timer, so it is tested with fake timers and a scripted `capture`.
 */
export function startFrameLoop(opts: FrameLoopOptions): FrameLoop {
  const timers = opts.timers ?? defaultTimers;
  let lastSentHash: string | null = null;
  let lastSeenHash: string | null = null;
  let paused = false;
  let stopped = false;
  let seq = 0;

  const tick = () => {
    if (paused || stopped) return;
    const frame = opts.capture();
    if (!frame) return;
    const tMs = opts.clock();
    const phash = dhashFromGray(frame.gray);

    if (lastSeenHash !== null && hamming(phash, lastSeenHash) > 0) opts.onScreenChange(tMs);
    lastSeenHash = phash;

    if (lastSentHash !== null && hamming(phash, lastSentHash) < opts.hammingThreshold) return;
    lastSentHash = phash;
    seq += 1;
    opts.onFrame({ ...frame, frameId: `f${seq}-${phash}`, tMs, phash });
  };

  const handle = timers.setInterval(tick, opts.intervalMs);

  return {
    tick,
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    stop() {
      stopped = true;
      timers.clearInterval(handle);
    },
  };
}
