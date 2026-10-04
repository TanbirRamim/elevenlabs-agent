import type { ScreenEvent } from "@shadow/schema";
import { describe, expect, it } from "vitest";
import { pushVisionLine, visionLine } from "./visionLines";

const ev = (
  payload: Record<string, unknown>,
  source: "vision" | "dom" = "vision",
): ScreenEvent => ({
  id: `ev_${Math.random().toString(36).slice(2, 8)}`,
  tMs: 12_000,
  frameId: "f1",
  source,
  summary: "x",
  payload,
});

describe("visionLine", () => {
  it("writes events in the brief's format", () => {
    expect(visionLine(ev({ kind: "opened", object: "ticket T3" }))?.text).toBe("T3 opened");
    expect(
      visionLine(
        ev({
          kind: "field_changed",
          object: "ticket T3",
          field: "refund_amount",
          from: "0",
          to: "240",
        }),
      )?.text,
    ).toBe("refund amount changed 0 → 240");
    expect(
      visionLine(ev({ kind: "field_changed", object: "ticket T1", field: "reply draft", from: "" }))
        ?.text,
    ).toBe("reply draft changed – → –");
    expect(
      visionLine(ev({ kind: "action", object: "ticket T4", to: "hand off to Security" }))?.text,
    ).toBe("T4: hand off to Security");
    expect(visionLine(ev({ kind: "opened", object: "invoice 4471" }))?.text).toBe("4471 opened");
  });

  it("ignores DOM events and payloads that are not vision events", () => {
    expect(visionLine(ev({ kind: "opened", object: "ticket T3" }, "dom"))).toBeNull();
    expect(visionLine(ev({ type: "ticket_opened" }))).toBeNull();
  });
});

describe("pushVisionLine", () => {
  it("keeps the newest lines first, capped", () => {
    let lines = pushVisionLine([], ev({ kind: "opened", object: "T1" }));
    for (let i = 2; i <= 7; i++)
      lines = pushVisionLine(lines, ev({ kind: "opened", object: `T${i}` }));
    expect(lines.map((l) => l.text)).toEqual([
      "T7 opened",
      "T6 opened",
      "T5 opened",
      "T4 opened",
      "T3 opened",
    ]);
  });
});
