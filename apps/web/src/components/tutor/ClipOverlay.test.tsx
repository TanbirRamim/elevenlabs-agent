// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_REPLAY_NOTE } from "../workmap/ClipPlayer";
import { sampleWorkMap } from "../workmap/fixture";
import { mapMoments } from "../workmap/load";
import { ClipOverlay } from "./ClipOverlay";
import { findMoment } from "./logic";

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

const frameId = sampleWorkMap.guardrails[0]?.evidence.moment.frameId ?? "";
const moment = findMoment(sampleWorkMap, frameId);

function renderOverlay(expertSessionId: string | null) {
  return render(
    <ClipOverlay
      frameId={frameId}
      moment={moment}
      expertName="Dana"
      expertSessionId={expertSessionId}
      nearby={mapMoments(sampleWorkMap)}
      onClose={() => {}}
    />,
  );
}

describe("ClipOverlay", () => {
  it("without a session shows the quote, its timestamp and an honest note, no player", () => {
    const { container } = renderOverlay(null);
    expect(screen.getByText(NO_REPLAY_NOTE)).toBeTruthy();
    expect(screen.getByText(`“${moment?.quote}”`)).toBeTruthy();
    expect(screen.getByText(/on screen at \d\d:\d\d/)).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByText(/not linked/i)).toBeNull();
  });

  it("with a session plays the recording at the clip", () => {
    const { container } = renderOverlay("sess_src");
    const video = container.querySelector("video");
    const [start, end] = moment?.moment.clip ?? [0, 0];
    expect(video?.getAttribute("src")).toContain(
      `/sessions/sess_src/recording#t=${start / 1000},${end / 1000}`,
    );
  });

  it("plays the stored frames as a slideshow when the recording is missing", async () => {
    stubImages(true);
    const { container } = renderOverlay("sess_src");
    fireEvent.error(container.querySelector("video") as HTMLVideoElement);
    const img = await screen.findByRole("img", { name: /Redacted screen at/ });
    expect(img.getAttribute("src")).toMatch(/\/sessions\/sess_src\/frames\/f_\d\.jpg$/);
    expect(container.querySelector("video")).toBeNull();
  });

  it("falls back to the note when neither a recording nor frames exist", async () => {
    stubImages(false);
    const { container } = renderOverlay("sess_src");
    fireEvent.error(container.querySelector("video") as HTMLVideoElement);
    expect(await screen.findByText(NO_REPLAY_NOTE)).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
  });
});
