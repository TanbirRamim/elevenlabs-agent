import { describe, expect, it } from "vitest";
import {
  formatControl,
  formatScreenUpdate,
  formatWorkMapContext,
  isControlMessage,
  mmss,
  WORKMAP_PREFIX,
} from "./protocol";

describe("voice protocol", () => {
  it("formats string and JSON control messages", () => {
    expect(formatControl("[ASK]", "Why Security on T4?")).toBe("[ASK] Why Security on T4?");
    expect(formatControl("[DEBRIEF]", { questions: [] })).toBe('[DEBRIEF] {"questions":[]}');
  });

  it("hides control and screen messages from the transcript, keeps real speech", () => {
    expect(isControlMessage("[ASK] why?")).toBe(true);
    expect(isControlMessage("  [INTERVENE] {}")).toBe(true);
    expect(isControlMessage("[SCREEN 00:12] T3 opened")).toBe(true);
    expect(isControlMessage('[EXPLAIN] {"stepId":"S2"}')).toBe(true);
    expect(isControlMessage("[WORKMAP]\n# Work Map")).toBe(true);
    expect(isControlMessage("Never refund with an open chargeback.")).toBe(false);
    expect(isControlMessage("[ASKING] is not a prefix")).toBe(false);
  });

  it("formats session time as mm:ss", () => {
    expect(mmss(0)).toBe("00:00");
    expect(mmss(192_400)).toBe("03:12");
    expect(mmss(-5)).toBe("00:00");
  });

  it("formats screen updates with the time stamp", () => {
    expect(formatScreenUpdate(192_000, " T3 status Open -> On hold ")).toBe(
      "[SCREEN 03:12] T3 status Open -> On hold",
    );
  });

  it("formats [EXPLAIN] like the other JSON controls", () => {
    expect(formatControl("[EXPLAIN]", { stepId: "S2", expertName: "Maya" })).toBe(
      '[EXPLAIN] {"stepId":"S2","expertName":"Maya"}',
    );
  });

  it("sends a short Work Map whole, prefixed on its own line", () => {
    expect(formatWorkMapContext("  # Map\n- G1 never refund  \n")).toBe(
      "[WORKMAP]\n# Map\n- G1 never refund",
    );
  });

  it("truncates a long Work Map at a line break, within the limit, and says so", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `- rule ${i}: "a quote from the expert"`);
    const out = formatWorkMapContext(lines.join("\n"), 2000);
    expect(out.startsWith(`${WORKMAP_PREFIX}\n- rule 0:`)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(2000 + WORKMAP_PREFIX.length + 1);
    expect(out).toContain("Work Map truncated");
    const kept = out.split("\n\n[Work Map truncated")[0] ?? "";
    expect(kept.endsWith('"a quote from the expert"')).toBe(true);
  });
});
