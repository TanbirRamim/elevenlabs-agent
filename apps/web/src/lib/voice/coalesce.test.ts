import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescer } from "./coalesce";

describe("coalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the first value immediately", () => {
    const sent: string[] = [];
    const c = createCoalescer<string>(2000, (v) => sent.push(v));
    c.push("a");
    expect(sent).toEqual(["a"]);
  });

  it("keeps only the newest value inside the interval, then sends it", () => {
    const sent: string[] = [];
    const c = createCoalescer<string>(2000, (v) => sent.push(v));
    c.push("a");
    vi.advanceTimersByTime(500);
    c.push("b");
    c.push("c");
    expect(sent).toEqual(["a"]);
    vi.advanceTimersByTime(1500);
    expect(sent).toEqual(["a", "c"]);
  });

  it("never sends more than one value per interval", () => {
    const sent: string[] = [];
    const c = createCoalescer<string>(2000, (v) => sent.push(v));
    for (let i = 0; i < 50; i++) {
      c.push(`v${i}`);
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(2000);
    expect(sent.length).toBe(4);
    expect(sent.at(-1)).toBe("v49");
  });

  it("flush sends the pending value at once; dispose drops it", () => {
    const sent: string[] = [];
    const c = createCoalescer<string>(2000, (v) => sent.push(v));
    c.push("a");
    c.push("b");
    c.flush();
    expect(sent).toEqual(["a", "b"]);
    c.push("c");
    c.dispose();
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual(["a", "b"]);
  });
});
