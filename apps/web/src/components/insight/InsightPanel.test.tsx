// @vitest-environment jsdom
import { CandidateQuestion } from "@shadow/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GateSignals } from "@/lib/turnGate";
import { InsightPanel } from "./InsightPanel";

afterEach(cleanup);

const signals = (over: Partial<GateSignals> = {}): GateSignals => ({
  nowMs: 300_000,
  lastUserSpeechMs: 296_800,
  lastInputActivityMs: null,
  lastScreenChangeMs: null,
  agentSpeaking: false,
  offRecord: false,
  questionsAskedMs: [],
  candidate: null,
  ...over,
});

const candidate = CandidateQuestion.parse({
  id: "q1",
  text: "Why did you route this one to Security instead of refunding?",
  slot: "reason",
  priority: 0.82,
  aboutTicketId: "T3",
  createdAtMs: 295_000,
});

describe("InsightPanel", () => {
  it("renders the reason sentence for a closed gate and never for null signals", () => {
    render(
      <InsightPanel
        now={300_000}
        signals={signals()}
        decision={{ open: false, reason: "user_typing" }}
        candidates={[candidate]}
        asked={[]}
        insight={null}
        offRecord={false}
      />,
    );
    expect(screen.getByTestId("gate-chip").textContent).toBe("Closed");
    expect(screen.getAllByText("Expert is typing").length).toBeGreaterThan(0);
    expect(screen.getByText("3.2 s ago")).toBeTruthy();
    expect(screen.getAllByText("never")).toHaveLength(2);
    expect(screen.getByText(candidate.text)).toBeTruthy();
    expect(screen.getByText("0.82")).toBeTruthy();
    expect(screen.getByTestId("priority-bar").style.width).toBe("82%");
  });

  it("formats the insight numbers and the asked question's pause", () => {
    render(
      <InsightPanel
        now={400_000}
        signals={signals()}
        decision={{ open: true }}
        candidates={[]}
        asked={[
          {
            id: "q0",
            text: "What made you check the account age first?",
            atMs: 125_000,
            pauseMs: { silence: 1_600, inputIdle: 3_200, screenIdle: 2_700 },
          },
        ]}
        insight={{
          visionLatencyMsP90: 1234.4,
          visionUnreadableFrames: 2,
          domVisionAgreement: 0.94,
          openGaps: 3,
        }}
        offRecord={false}
      />,
    );
    expect(screen.getByTestId("gate-chip").textContent).toBe("Open");
    expect(screen.getByText("94%")).toBeTruthy();
    expect(screen.getByText("1234 ms")).toBeTruthy();
    expect(screen.getByText("02:05")).toBeTruthy();
    expect(screen.getByText(/silence 1\.6 s · no input 3\.2 s · screen still 2\.7 s/)).toBeTruthy();
  });

  it("collapses to one line and calls onToggle from a real button", () => {
    const onToggle = vi.fn();
    render(
      <InsightPanel
        now={1_000}
        signals={signals()}
        decision={{ open: false, reason: "off_record" }}
        candidates={[]}
        asked={[]}
        insight={null}
        offRecord={true}
        collapsed
        onToggle={onToggle}
      />,
    );
    expect(screen.queryByText("Gate signals")).toBeNull();
    const button = screen.getByRole("button", { name: "Expand" });
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
