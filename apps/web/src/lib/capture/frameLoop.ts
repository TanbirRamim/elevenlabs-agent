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
  /**
   * A visible change (distance from the last SEEN frame of at least `changeThreshold`), whether
   * or not the frame is sent. Feeds the Turn Gate.
   */
  onScreenChange: (tMs: number) => void;
  /**
   * Minimum dHash distance between consecutive frames that counts as the screen changing.
   * Default 1 (any bit). A shared tab arrives as compressed video, so a still, mostly white
   * desk flickers by a few bits from frame to frame; set this above that noise or the Turn
   * Gate reads a still screen as "changing" forever.
   */
  changeThreshold?: number;
  /**
   * Send a frame at least this often while sharing, even when the screen is still, so the
   * server always has a frame from the last couple of seconds (it skips vision on a screen it
   * has already read). Default 2000; 0 turns the heartbeat off. A tick sends when waiting for
   * the next one would leave a gap longer than this.
   */
  heartbeatMs?: number;
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

export const DEFAULT_HEARTBEAT_MS = 2000;

/**
 * Captures every `intervalMs`, hashes, and sends frames that differ from the last sent one, plus
 * a heartbeat frame so no gap between sent frames is longer than `heartbeatMs`.
 * Pure apart from the timer, so it is tested with fake timers and a scripted `capture`.
 */
export function startFrameLoop(opts: FrameLoopOptions): FrameLoop {
  const timers = opts.timers ?? defaultTimers;
  const changeThreshold = Math.max(1, opts.changeThreshold ?? 1);
  const heartbeatMs = Math.max(0, opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  let lastSentHash: string | null = null;
  let lastSentAt = 0;
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

    if (lastSeenHash !== null && hamming(phash, lastSeenHash) >= changeThreshold)
      opts.onScreenChange(tMs);
    lastSeenHash = phash;

    const unchanged = lastSentHash !== null && hamming(phash, lastSentHash) < opts.hammingThreshold;
    const heartbeatDue = heartbeatMs > 0 && tMs - lastSentAt + opts.intervalMs > heartbeatMs;
    if (unchanged && !heartbeatDue) return;
    lastSentHash = phash;
    lastSentAt = tMs;
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
