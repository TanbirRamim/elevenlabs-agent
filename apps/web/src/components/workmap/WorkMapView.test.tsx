// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sampleWorkMap } from "./fixture";
import { WorkMapView } from "./WorkMapView";

afterEach(cleanup);

async function renderFixture(sessionId: string | null = null) {
  const utils = render(<WorkMapView id="latest" sessionId={sessionId} forceFixture />);
  await screen.findByText("Sample data");
  return utils;
}

describe("WorkMapView with the sample map", () => {
  it("renders every step title and the sample-data badge", async () => {
    await renderFixture();
    const timeline = screen.getByRole("list", { name: "Steps" });
    for (const step of sampleWorkMap.steps) {
      expect(within(timeline).getByText(step.title)).toBeTruthy();
    }
    expect(screen.getAllByText("Judgment call").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getByText("Confirmed at 12:45")).toBeTruthy();
  });

  it("shows a step's verbatim quote, decision and linked guardrails when clicked", async () => {
    await renderFixture();
    const step = sampleWorkMap.steps.find((s) => s.id === "S4");
    if (!step) throw new Error("fixture step S4 missing");

    fireEvent.click(screen.getByRole("button", { name: new RegExp(step.title) }));

    const detail = screen.getByRole("region", { name: "Step detail" });
    expect(within(detail).getByText(`“${step.reason.text}”`)).toBeTruthy();
    expect(within(detail).getByText(step.decision)).toBeTruthy();
    expect(within(detail).getByText("05:16")).toBeTruthy();
    expect(within(detail).getByText("customer has an open chargeback")).toBeTruthy();
  });

  it("filters the guardrail list by type", async () => {
    await renderFixture();
    const list = () => screen.getByRole("list", { name: "Guardrail list" });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(4);

    fireEvent.click(screen.getByRole("radio", { name: "Never (1)" }));
    const items = within(list()).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(
      within(items[0] as HTMLElement).getByText("customer has an open chargeback"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Stop and ask (2)" }));
    expect(within(list()).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(within(list()).getAllByRole("listitem")).toHaveLength(4);
  });

  it("opens a guardrail's evidence and shows its quote", async () => {
    await renderFixture();
    fireEvent.click(screen.getByRole("button", { name: /signs of account takeover/ }));
    expect(screen.getByText("“I stop, I don't send anything, Security takes it.”")).toBeTruthy();
  });

  it("hides the clip player without a session id and shows it with one", async () => {
    const { unmount } = await renderFixture();
    expect(screen.queryByLabelText(/Session clip/)).toBeNull();
    unmount();

    await renderFixture("sess_42");
    const video = screen.getByLabelText(/Session clip/);
    expect(video.getAttribute("src")).toContain("/sessions/sess_42/recording#t=32,44");
  });

  it("disables expert controls in fixture mode", async () => {
    await renderFixture();
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove step" })).toBeNull();
  });
});
