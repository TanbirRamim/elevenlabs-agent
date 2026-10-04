// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  burstsOf,
  GateTimeline,
  type GateTimelineProps,
  subtractSpans,
  summarizeTimeline,
} from "./GateTimeline";

afterEach(cleanup);

const props: GateTimelineProps = {
  endMs: 600_000,
  speech: [
    { startMs: 10_000, endMs: 15_000 },
    { startMs: 290_000, endMs: 310_000 }, // partly off the record
  ],
  typing: [20_000, 20_500, 21_000, 120_000],
  screen: [19_000, 22_000, 295_000],
  offRecord: [{ startMs: 300_000, endMs: 360_000 }],
  asking: [{ startMs: 80_000, endMs: 83_000 }],
  questions: [
    {
      id: "q1",
      atMs: 80_000,
      text: "You used the invoice macro there. When would you write your own reply?",
      slot: "reason",
      ticketId: "T1",
      pause: { silenceMs: 34_000, inputIdleMs: 3_000, screenIdleMs: 3_000 },
      readyAtMs: 77_000,
      heldBy: ["Expert is typing"],
    },
    {
      id: "q2",
      atMs: 400_000,
      text: "You held that refund instead of sending it. What stopped you?",
      slot: "guardrail",
      ticketId: "T3",
      pause: { silenceMs: 1_500, inputIdleMs: 3_000, screenIdleMs: 2_500 },
    },
  ],
  dropped: [
    {
      id: "c4",
      atMs: 470_000,
      text: "Why Security?",
      reason: "Answered aloud",
      readyAtMs: 460_000,
    },
  ],
};

describe("GateTimeline", () => {
  it("is an image with a text summary of what the gate did", () => {
    render(<GateTimeline {...props} />);
    const img = screen.getByRole("img");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toContain("2 questions asked");
    expect(label).toContain("01:20, 06:40");
    expect(label).toContain("Off the record 05:00 to 06:00");
    expect(label).toContain("1 question dropped");
  });

  it("has a hidden table with one row per question and its pause metrics", () => {
    render(<GateTimeline {...props} />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2
    expect(within(rows[1] as HTMLElement).getByText("34.0 s")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("Guardrail")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Expert is typing")).toBeTruthy();
  });

  it("shows the gate's reason and pause on focus, and hides it on blur or Escape", () => {
    render(<GateTimeline {...props} />);
    const marker = screen.getByRole("button", { name: "Question 1 at 01:20" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(marker);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("The gate opened after");
    expect(tip.textContent).toContain("34.0 s");
    expect(tip.textContent).toContain("Held 3.0 s: expert is typing");
    expect(marker.getAttribute("aria-describedby")).toBe(tip.id);
    fireEvent.keyDown(marker, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(marker);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("draws live: nothing after nowMs", () => {
    render(<GateTimeline {...props} nowMs={200_000} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("1 question asked");
  });

  it("marks dropped questions separately", () => {
    render(<GateTimeline {...props} />);
    const dropped = screen.getByRole("button", { name: "Question dropped at 07:50" });
    fireEvent.focus(dropped);
    expect(screen.getByRole("tooltip").textContent).toContain("Answered aloud");
  });
});

describe("GateTimeline helpers", () => {
  it("never draws anything from off the record", () => {
    expect(subtractSpans(props.speech, props.offRecord ?? [])).toEqual([
      { startMs: 10_000, endMs: 15_000 },
      { startMs: 290_000, endMs: 300_000 },
    ]);
  });

  it("groups keystrokes into bursts", () => {
    expect(burstsOf([20_000, 20_500, 21_000, 120_000])).toEqual([
      { startMs: 20_000, endMs: 21_000 },
      { startMs: 120_000, endMs: 120_000 },
    ]);
  });

  it("summarizes an empty session", () => {
    expect(summarizeTimeline({ ...props, nowMs: 5_000 })).toContain("No questions asked yet.");
  });
});
