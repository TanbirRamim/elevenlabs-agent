// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initials } from "./Avatar";
import { Badge, StatusPill } from "./Badge";
import { EmptyState } from "./EmptyState";
import { Field, Input } from "./Input";
import { clampRatio, Meter, Progress } from "./Progress";
import { nextEnabledIndex, SegmentedControl } from "./SegmentedControl";
import { Tabs } from "./Tabs";

afterEach(cleanup);

describe("nextEnabledIndex", () => {
  it("wraps and skips disabled options", () => {
    expect(nextEnabledIndex([false, true, false], 0, 1)).toBe(2);
    expect(nextEnabledIndex([false, true, false], 2, 1)).toBe(0);
    expect(nextEnabledIndex([false, true, false], 0, -1)).toBe(2);
    expect(nextEnabledIndex([true, true, true], 1, 1)).toBe(1);
  });
});

describe("clampRatio", () => {
  it("clamps to 0..1 and survives bad input", () => {
    expect(clampRatio(5, 10)).toBe(0.5);
    expect(clampRatio(-1, 10)).toBe(0);
    expect(clampRatio(20, 10)).toBe(1);
    expect(clampRatio(1, 0)).toBe(0);
    expect(clampRatio(Number.NaN, 10)).toBe(0);
  });
});

describe("initials", () => {
  it("uses first and last word", () => {
    expect(initials("Maya Okafor")).toBe("MO");
    expect(initials("jonas")).toBe("J");
    expect(initials("  ")).toBe("?");
  });
});

describe("Badge and StatusPill", () => {
  it("renders the words; the dot is decorative", () => {
    render(
      <>
        <Badge tone="guard" dot>
          Guardrail
        </Badge>
        <StatusPill tone="rec" live>
          Recording
        </StatusPill>
      </>,
    );
    expect(screen.getByText("Guardrail").className).toContain("bg-guard-wash");
    const pill = screen.getByText("Recording");
    const dot = pill.querySelector("[aria-hidden='true']");
    expect(dot?.className).toContain("animate-rec-pulse");
  });
});

describe("Progress and Meter", () => {
  it("exposes progressbar values", () => {
    render(<Progress label="Work Map draft" value={2} max={4} valueText="2 of 4" />);
    const bar = screen.getByRole("progressbar", { name: "Work Map draft" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuetext")).toBe("2 of 4");
  });

  it("is indeterminate without a value", () => {
    render(<Progress label="Transcribing" />);
    const bar = screen.getByRole("progressbar", { name: "Transcribing" });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.getAttribute("aria-valuetext")).toBe("In progress");
  });

  it("lights the right number of meter segments", () => {
    const { container } = render(<Meter label="Mic level" value={0.5} segments={10} tone="rec" />);
    expect(screen.getByRole("meter", { name: "Mic level" })).toBeTruthy();
    expect(container.querySelectorAll(".bg-rec")).toHaveLength(5);
  });
});

describe("SegmentedControl", () => {
  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [v, setV] = useState<"all" | "never" | "ask">("all");
    return (
      <SegmentedControl
        label="Filter guardrails"
        value={v}
        onChange={(next) => {
          setV(next);
          onChange(next);
        }}
        options={[
          { value: "all", label: "All" },
          { value: "never", label: "Never", disabled: true },
          { value: "ask", label: "Stop and ask" },
        ]}
      />
    );
  }

  it("is a radiogroup with one tab stop and arrow-key selection", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Filter guardrails" })).toBeTruthy();
    const all = screen.getByRole("radio", { name: "All" });
    expect(all.getAttribute("aria-checked")).toBe("true");
    expect(all.tabIndex).toBe(0);
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("ask");
    expect(screen.getByRole("radio", { name: "Stop and ask" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});

describe("Tabs", () => {
  it("wires tabs to panels and moves with arrows", () => {
    render(
      <Tabs
        label="Session views"
        items={[
          { value: "steps", label: "Steps", count: 6, content: <p>Steps panel</p> },
          { value: "guardrails", label: "Guardrails", content: <p>Guardrails panel</p> },
        ]}
      />,
    );
    const steps = screen.getByRole("tab", { name: /Steps/ });
    expect(steps.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Steps panel");
    fireEvent.keyDown(steps, { key: "ArrowRight" });
    const guard = screen.getByRole("tab", { name: "Guardrails" });
    expect(guard.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Guardrails" }).textContent).toBe(
      "Guardrails panel",
    );
  });
});

describe("Field", () => {
  it("labels the control and links hint and error", () => {
    render(
      <Field label="Learner name" hint="Shown on the mastery report" error="Required">
        {(a11y) => <Input {...a11y} />}
      </Field>,
    );
    const input = screen.getByLabelText("Learner name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);
  });
});

describe("EmptyState", () => {
  it("says what is empty and offers the next step", () => {
    render(
      <EmptyState
        title="No events yet"
        description="Open a ticket."
        action={<button type="button">Open</button>}
      />,
    );
    expect(screen.getByText("No events yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
  });
});
