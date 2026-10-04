import { describe, expect, it } from "vitest";
import { onWakeState, waitForApi } from "./index";

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("waitForApi", () => {
  it("polls /health until it answers and reports waking then awake", async () => {
    const c = clock();
    const seen: string[] = [];
    const off = onWakeState((s) => seen.push(s));
    let calls = 0;
    const ok = await waitForApi("https://api.test", {
      ...c,
      timeoutMs: 60_000,
      fetch: async (url) => {
        expect(url).toBe("https://api.test/health");
        calls += 1;
        if (calls < 3) throw new Error("connection refused");
        return { ok: true };
      },
    });
    off();
    expect(ok).toBe(true);
    expect(calls).toBe(3);
    expect(seen).toEqual(["waking", "awake"]);
  });

  it("gives up after the timeout and reports down", async () => {
    const c = clock();
    const ok = await waitForApi("https://api.test", {
      ...c,
      timeoutMs: 9_000,
      intervalMs: 3_000,
      fetch: async () => ({ ok: false }),
    });
    expect(ok).toBe(false);
  });
});
