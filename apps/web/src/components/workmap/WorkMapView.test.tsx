// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_REPLAY_NOTE } from "./ClipPlayer";
import { sampleWorkMap } from "./fixture";
import { FrameImage, StepDetail } from "./StepDetail";
import { WorkMapView } from "./WorkMapView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Makes every `new Image()` load (or fail) on the next tick, as the API would answer. */
function stubImages(ok: boolean) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      setTimeout(() => (ok ? this.onload?.() : this.onerror?.()), 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

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
    const judgmentCalls = sampleWorkMap.steps.filter((s) => s.judgmentCall).length;
    expect(screen.getAllByText("Judgment call").length).toBeGreaterThanOrEqual(judgmentCalls);
    expect(screen.getByText("90%")).toBeTruthy();
    expect(screen.getByText("Confirmed at 11:45")).toBeTruthy();
  });

  it("shows a step's verbatim quote, decision and linked guardrails when clicked", async () => {
    await renderFixture();
    const step = sampleWorkMap.steps.find((s) => s.id === "S4");
    if (!step) throw new Error("fixture step S4 missing");

    fireEvent.click(screen.getByRole("button", { name: new RegExp(step.title) }));

    const detail = screen.getByRole("region", { name: "Step detail" });
    // S4's reason is also the evidence quote of its guardrail G3, so it can show twice.
    expect(within(detail).getAllByText(`“${step.reason.text}”`).length).toBeGreaterThan(0);
    expect(within(detail).getByText(step.decision)).toBeTruthy();
    expect(within(detail).getAllByText("07:11").length).toBeGreaterThan(0);
    expect(within(detail).getByText("signs of account takeover")).toBeTruthy();
    expect(within(detail).getByText("card used without permission / fraud")).toBeTruthy();
  });

  it("filters the guardrail list by type", async () => {
    await renderFixture();
    const list = () => screen.getByRole("list", { name: "Guardrail list" });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(5);

    fireEvent.click(screen.getByRole("radio", { name: "Never (2)" }));
    const items = within(list()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      within(items[0] as HTMLElement).getByText("customer has an open chargeback"),
    ).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("GDPR / data deletion request")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Stop and ask (2)" }));
    expect(within(list()).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(within(list()).getAllByRole("listitem")).toHaveLength(5);
  });

  it("opens a guardrail's evidence and shows its quote", async () => {
    await renderFixture();
    fireEvent.click(screen.getByRole("button", { name: /signs of account takeover/ }));
    expect(
      screen.getAllByText(
        "“Someone changed my email is an account takeover flag, so no refund and straight to Security.”",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("hides the clip player without a session id and shows it with one", async () => {
    const { unmount } = await renderFixture();
    expect(screen.queryByLabelText(/Session clip/)).toBeNull();
    unmount();

    await renderFixture("sess_42");
    const video = screen.getByLabelText(/Session clip/);
    expect(video.getAttribute("src")).toContain("/sessions/sess_42/recording#t=57,67");
    // The poster is the step's redacted frame, addressed by the session it was stored under.
    const frameId = sampleWorkMap.steps[0]?.moment.frameId ?? "";
    expect(video.getAttribute("poster")).toMatch(
      new RegExp(`/sessions/sess_42/frames/${frameId}\\.jpg$`),
    );
  });

  it("shows the stored frames when the recording is missing", async () => {
    stubImages(true);
    await renderFixture("sess_42");
    fireEvent.error(screen.getByLabelText(/Session clip/));
    const img = await screen.findByRole("img", { name: /Redacted screen at/ });
    expect(img.getAttribute("src")).toMatch(/\/sessions\/sess_42\/frames\/f_1\.jpg$/);
    expect(screen.queryByRole("button", { name: "Play clip" })).toBeNull();
  });

  it("shows an honest note, no dead controls, when neither recording nor frames exist", async () => {
    stubImages(false);
    await renderFixture("sess_42");
    fireEvent.error(screen.getByLabelText(/Session clip/));
    expect((await screen.findAllByText(NO_REPLAY_NOTE)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Play clip" })).toBeNull();
  });

  it("disables expert controls in fixture mode", async () => {
    await renderFixture();
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove step" })).toBeNull();
  });
});

describe("WorkMapView with a published map from the API", () => {
  function serve(map: object) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(map), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
  }
  const { sourceSessionId: _drop, ...noSession } = sampleWorkMap;

  it("requests no frame image when the map has no source session", async () => {
    serve(noSession);
    const { container } = render(<WorkMapView id="latest" sessionId={null} forceFixture={false} />);
    const detail = await screen.findByRole("region", { name: "Step detail" });
    expect(container.querySelector("img")).toBeNull();
    expect(within(detail).getByText("No frame to show")).toBeTruthy();
  });

  it("falls back to the placeholder when a frame fails to load", () => {
    const step = sampleWorkMap.steps[0];
    if (!step) throw new Error("fixture has no steps");
    const { container } = render(
      <FrameImage frameId={step.moment.frameId} tMs={step.moment.tMs} sessionId="sess_42" />,
    );
    const img = container.querySelector("img");
    if (!img) throw new Error("expected a frame image");
    expect(img.getAttribute("src")).toContain(
      `/sessions/sess_42/frames/${step.moment.frameId}.jpg`,
    );
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("The frame could not be loaded from the API.")).toBeTruthy();
  });

  it("requests no frame image without a session to address it by", () => {
    const step = sampleWorkMap.steps[0];
    if (!step) throw new Error("fixture has no steps");
    const { container } = render(
      <StepDetail
        step={step}
        guardrails={sampleWorkMap.guardrails}
        sessionId={null}
        canEdit={false}
        busy={false}
        onRemove={async () => {}}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("No frame to show")).toBeTruthy();
  });
});
