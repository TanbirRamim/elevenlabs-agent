/**
 * Rate limiter where the newest value wins: at most one `send` per `intervalMs`.
 * Used for screen context so the agent gets the latest state, not a backlog.
 * Pure (clock and timers injected); tested in coalesce.test.ts.
 */
export interface Coalescer<T> {
  push(value: T): void;
  /** Sends a pending value now, ignoring the interval. */
  flush(): void;
  dispose(): void;
}

export function createCoalescer<T>(
  intervalMs: number,
  send: (value: T) => void,
  now: () => number = () => Date.now(),
  timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout"> = globalThis,
): Coalescer<T> {
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sendNow = (value: T) => {
    lastSentAt = now();
    pending = null;
    send(value);
  };

  return {
    push(value) {
      const elapsed = now() - lastSentAt;
      if (elapsed >= intervalMs && timer === null) {
        sendNow(value);
        return;
      }
      pending = { value };
      if (timer === null) {
        timer = timers.setTimeout(
          () => {
            timer = null;
            if (pending) sendNow(pending.value);
          },
          Math.max(0, intervalMs - elapsed),
        );
      }
    },
    flush() {
      if (timer !== null) {
        timers.clearTimeout(timer);
        timer = null;
      }
      if (pending) sendNow(pending.value);
    },
    dispose() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
