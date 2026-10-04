/** Pure helpers for the recording kit. No DOM, no timers: unit-tested in logic.test.ts. */

export type PreflightStatus = "pending" | "ok" | "failed";
export type ProcessingStatus = "waiting" | "running" | "done" | "failed" | "skipped";

/** Formats elapsed time as mm:ss, or h:mm:ss from one hour. Negative or invalid input is 00:00. */
export function formatElapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const total = Math.floor(safe / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** How many of `segments` meter segments a 0..1 level lights. Clamped; invalid input lights none. */
export function levelToSegments(level: number, segments: number): number {
  if (!Number.isFinite(level) || !Number.isFinite(segments) || segments <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, level));
  return Math.round(clamped * Math.floor(segments));
}

export type PreflightLike = { id: string; status: PreflightStatus };

export type PreflightSummary<T extends PreflightLike> = {
  ready: boolean;
  ok: number;
  pending: number;
  failed: number;
  total: number;
  /** Items that stop recording from starting (pending or failed), in list order. */
  blocking: T[];
};

export function summarizePreflight<T extends PreflightLike>(
  items: readonly T[],
): PreflightSummary<T> {
  const ok = items.filter((i) => i.status === "ok").length;
  const pending = items.filter((i) => i.status === "pending").length;
  const failed = items.filter((i) => i.status === "failed").length;
  return {
    ready: items.length > 0 && ok === items.length,
    ok,
    pending,
    failed,
    total: items.length,
    blocking: items.filter((i) => i.status !== "ok"),
  };
}

export type ProcessingLike = { id: string; status: ProcessingStatus };

export type ProcessingProgress<T extends ProcessingLike> = {
  /** Done or skipped steps. */
  done: number;
  total: number;
  current: T | undefined;
  failed: T | undefined;
  complete: boolean;
  ratio: number;
};

export function processingProgress<T extends ProcessingLike>(
  steps: readonly T[],
): ProcessingProgress<T> {
  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const total = steps.length;
  return {
    done,
    total,
    current: steps.find((s) => s.status === "running"),
    failed: steps.find((s) => s.status === "failed"),
    complete: total > 0 && done === total,
    ratio: total > 0 ? done / total : 0,
  };
}

/** Countdown state: the number on screen, or done. */
export type CountdownState = { remaining: number; done: boolean };

export type CountdownAction = { type: "tick" } | { type: "skip" } | { type: "reset"; from: number };

export function countdownReducer(state: CountdownState, action: CountdownAction): CountdownState {
  switch (action.type) {
    case "tick": {
      if (state.done) return state;
      const remaining = state.remaining - 1;
      return remaining <= 0 ? { remaining: 0, done: true } : { remaining, done: false };
    }
    case "skip":
      return { remaining: 0, done: true };
    case "reset": {
      const from = Math.max(0, Math.floor(action.from));
      return { remaining: from, done: from === 0 };
    }
    default:
      return state;
  }
}
