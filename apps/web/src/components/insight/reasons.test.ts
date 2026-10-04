import { describe, expect, it } from "vitest";
import { formatAgo, formatClock, formatMs, formatPercent, formatSeconds } from "./format";
import { OPEN_SENTENCE, REASON_SENTENCES, reasonSentence } from "./reasons";

describe("reasonSentence", () => {
  it("maps every closed reason to a short sentence", () => {
    for (const [reason, sentence] of Object.entries(REASON_SENTENCES)) {
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.length).toBeLessThan(60);
      expect(sentence).not.toContain("_");
      expect(reason).toMatch(/^[a-z_]+$/);
    }
  });
  it("says the expert is typing", () => {
    expect(reasonSentence({ open: false, reason: "user_typing" })).toBe("Expert is typing");
  });
  it("has an open sentence", () => {
    expect(reasonSentence({ open: true })).toBe(OPEN_SENTENCE);
  });
});

describe("format", () => {
  it("formats elapsed time and never", () => {
    expect(formatAgo(10_000, 6_800)).toBe("3.2 s ago");
    expect(formatAgo(10_000, null)).toBe("never");
    expect(formatAgo(5_000, 9_000)).toBe("0.0 s ago");
  });
  it("formats durations, clocks, percentages and latencies", () => {
    expect(formatSeconds(1_500)).toBe("1.5 s");
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatPercent(0.94)).toBe("94%");
    expect(formatPercent(null)).toBe("—");
    expect(formatMs(1234.5)).toBe("1235 ms");
    expect(formatMs(null)).toBe("—");
  });
});
