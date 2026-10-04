/**
 * The API runs on a free host that sleeps when idle and restarts on every deploy. A request that
 * hits it then fails for up to a minute. Instead of showing "API unreachable", callers wait here
 * until /health answers, while a banner tells the person what is happening.
 */

export type WakeState = "awake" | "waking" | "down";
type Listener = (state: WakeState) => void;

const listeners = new Set<Listener>();
let state: WakeState = "awake";
let pending: Promise<boolean> | null = null;

export function wakeState(): WakeState {
  return state;
}

export function onWakeState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(next: WakeState) {
  if (next === state) return;
  state = next;
  for (const l of listeners) l(next);
}

export interface WaitOptions {
  fetch?: (url: string) => Promise<{ ok: boolean }>;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Polls `${baseUrl}/health` until it answers or the timeout passes. Concurrent callers share one wait. */
export function waitForApi(baseUrl: string, opts: WaitOptions = {}): Promise<boolean> {
  if (pending) return pending;
  const fetchImpl = opts.fetch ?? ((url: string) => globalThis.fetch(url, { cache: "no-store" }));
  // Unit tests mock fetch failures; they must not sit through a real wake wait.
  const timeoutMs = opts.timeoutMs ?? (process.env.NODE_ENV === "test" ? 0 : 90_000);
  const intervalMs = opts.intervalMs ?? 3_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  set("waking");
  pending = (async () => {
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      try {
        if ((await fetchImpl(`${baseUrl}/health`)).ok) {
          set("awake");
          return true;
        }
      } catch {
        // still waking
      }
      await sleep(intervalMs);
    }
    set("down");
    return false;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/** Statuses a sleeping or redeploying host answers with before the app is up. */
export const WAKE_STATUSES = new Set([502, 503, 504]);
