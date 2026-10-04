import { describe, expect, it } from "vitest";
import { formatControl, formatScreenUpdate, isControlMessage, mmss } from "./protocol";

describe("voice protocol", () => {
  it("formats string and JSON control messages", () => {
    expect(formatControl("[ASK]", "Why Security on T4?")).toBe("[ASK] Why Security on T4?");
    expect(formatControl("[DEBRIEF]", { questions: [] })).toBe('[DEBRIEF] {"questions":[]}');
  });

  it("hides control and screen messages from the transcript, keeps real speech", () => {
    expect(isControlMessage("[ASK] why?")).toBe(true);
    expect(isControlMessage("  [INTERVENE] {}")).toBe(true);
    expect(isControlMessage("[SCREEN 00:12] T3 opened")).toBe(true);
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
});
