// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Countdown } from "./Countdown";
import { ListeningIndicator } from "./ListeningIndicator";
import { PreflightChecklist } from "./PreflightChecklist";
import { ProcessingSteps } from "./ProcessingSteps";
import { RecordingBar } from "./RecordingBar";
import { RecordingStatus } from "./RecordingStatus";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RecordingBar", () => {
  it("is a labelled toolbar showing REC and elapsed time while recording", () => {
    render(<RecordingBar state="recording" elapsedMs={252_000} level={0.5} />);
    const bar = screen.getByRole("toolbar", { name: "Recording controls" });
    expect(bar.textContent).toContain("REC");
    expect(screen.getByLabelText("Elapsed 04:12")).toBeTruthy();
    expect(
      screen.getByRole("meter", { name: "Microphone level" }).getAttribute("aria-valuenow"),
    ).toBe("0.5");
    const toggle = screen.getByRole("button", { name: /Off the record/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onPause and onStop", () => {
    const onPause = vi.fn();
    const onStop = vi.fn();
    render(<RecordingBar state="recording" elapsedMs={0} onPause={onPause} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("shows Resume when paused", () => {
    const onResume = vi.fn();
    render(<RecordingBar state="paused" elapsedMs={0} onResume={onResume} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("off the record reads Not recording, never REC, and the toggle is pressed", () => {
    render(<RecordingBar state="off-record" elapsedMs={10_000} level={0.9} />);
    const bar = screen.getByRole("toolbar", { name: "Recording controls" });
    expect(bar.textContent).toContain("Not recording");
    expect(bar.textContent).not.toContain("REC");
    expect(bar.querySelector(".bg-rec")).toBeNull();
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0");
    const toggle = screen.getByRole("button", { name: /Back on the record/ });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("RecordingStatus", () => {
  it("names the state and time", () => {
    render(<RecordingStatus state="recording" elapsedMs={65_000} />);
    expect(screen.getByRole("status", { name: "Recording, 01:05" })).toBeTruthy();
    cleanup();
    render(<RecordingStatus state="idle" elapsedMs={0} />);
    expect(screen.getByRole("status").textContent).toBe("Not recording");
  });
});

describe("PreflightChecklist", () => {
  it("summarises and shows the fix hint only for failed checks", () => {
    render(
      <PreflightChecklist
        items={[
          { id: "mic", label: "Microphone", status: "ok", fixHint: "unused hint" },
          {
            id: "screen",
            label: "Screen share",
            status: "failed",
            fixHint: "Choose the helpdesk tab and press Share.",
          },
          { id: "agent", label: "Voice agent", status: "pending" },
          { id: "redaction", label: "Redaction", status: "ok" },
        ]}
      />,
    );
    expect(screen.getByText("2 of 4 ready, 1 needs attention")).toBeTruthy();
    expect(screen.getByText("Choose the helpdesk tab and press Share.")).toBeTruthy();
    expect(screen.queryByText("unused hint")).toBeNull();
    expect(screen.getByRole("list", { name: "Preflight checks" }).children).toHaveLength(4);
  });

  it("says ready when every check passes", () => {
    render(<PreflightChecklist items={[{ id: "mic", label: "Microphone", status: "ok" }]} />);
    expect(screen.getByText("Ready to record")).toBeTruthy();
  });
});

describe("Countdown", () => {
  it("counts down each second and calls onDone once", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Countdown from={3} onDone={onDone} />);
    expect(screen.getByRole("timer").textContent).toBe("3");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("timer").textContent).toBe("2");
    // Each tick schedules the next after React re-renders, so advance one second per act().
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("timer").textContent).toBe("1");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skips with the button and with Escape", () => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    render(<Countdown onDone={onDone} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
    const onDone2 = vi.fn();
    render(<Countdown onDone={onDone2} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDone2).toHaveBeenCalledTimes(1);
  });
});

describe("ProcessingSteps", () => {
  it("exposes overall and step progress", () => {
    render(
      <ProcessingSteps
        steps={[
          { id: "transcript", label: "Transcript", status: "done" },
          { id: "redaction", label: "Redaction", status: "done" },
          { id: "workmap", label: "Work Map draft", status: "running", progress: 0.4 },
          { id: "verification", label: "Verification", status: "waiting" },
        ]}
      />,
    );
    const overall = screen.getByRole("progressbar", { name: "Overall progress" });
    expect(overall.getAttribute("aria-valuenow")).toBe("2");
    expect(overall.getAttribute("aria-valuemax")).toBe("4");
    expect(overall.getAttribute("aria-valuetext")).toBe("2 of 4 steps");
    const step = screen.getByRole("progressbar", { name: "Work Map draft" });
    expect(step.getAttribute("aria-valuenow")).toBe("40");
  });

  it("reports a failure honestly", () => {
    render(
      <ProcessingSteps
        steps={[
          { id: "transcript", label: "Transcript", status: "failed", detail: "Upload timed out" },
          { id: "redaction", label: "Redaction", status: "waiting" },
        ]}
      />,
    );
    expect(screen.getByText("Stopped at Transcript")).toBeTruthy();
    expect(screen.getByText("Upload timed out")).toBeTruthy();
  });
});

describe("ListeningIndicator", () => {
  it.each([
    ["listening", "Shadow is listening"],
    ["asking", "Shadow is asking"],
    ["quiet", "Shadow is quiet"],
    ["off", "Voice off"],
  ] as const)("%s reads %s", (state, text) => {
    render(<ListeningIndicator state={state} />);
    expect(screen.getByRole("status").textContent).toBe(text);
  });

  it("keeps the label for screen readers when compact", () => {
    render(<ListeningIndicator state="asking" compact />);
    expect(screen.getByRole("status", { name: "Shadow is asking" })).toBeTruthy();
  });
});
