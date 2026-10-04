// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DebriefPanel } from "../../components/debrief/DebriefPanel";
import type { DebriefApi } from "../../components/debrief/useDebrief";
import { sampleWorkMap } from "../../components/workmap/fixture";
import type { VoiceLine } from "../../lib/voice";
import { useForwardTranscript } from "./useForwardTranscript";

afterEach(cleanup);

const TEACHBACK = "You refund small charges yourself. Did I get that right?";

function client(): DebriefApi {
  return {
    endSession: vi.fn(async () => ({ workMapId: "wm_1", coverage: 0.95, openQuestions: [] })),
    answerDebrief: vi.fn(),
    requestTeachBack: vi.fn(async () => ({ text: TEACHBACK })),
    confirmTeachBack: vi.fn(async () => ({
      workMap: { ...sampleWorkMap, teachBackConfirmedAtMs: 1000 },
    })),
    getPredictionVariants: vi.fn(async () => ({ variants: [] })),
  };
}

/** CaptureSession's wiring: the parent forwards lines and marks them sent; the debrief reads them. */
function Harness({ lines, api }: { lines: VoiceLine[]; api: DebriefApi }) {
  const sent = useRef(new Set<string>());
  useForwardTranscript(lines, (line) => sent.current.add(line.id));
  return (
    <DebriefPanel
      sessionId="s1"
      voice={{ connected: true, transcript: lines, speak: () => true }}
      clock={() => 1000}
      isSent={(id) => sent.current.has(id)}
      sendTypedLine={() => null}
      client={api}
    />
  );
}

describe("useForwardTranscript", () => {
  it("forwards each line once, in order", () => {
    const seen: string[] = [];
    function Probe({ lines }: { lines: VoiceLine[] }) {
      useForwardTranscript(lines, (l) => seen.push(l.id));
      return null;
    }
    const a: VoiceLine = { id: "l1", role: "user", text: "a", tMs: 1 };
    const b: VoiceLine = { id: "l2", role: "agent", text: "b", tMs: 2 };
    const { rerender } = render(<Probe lines={[a]} />);
    rerender(<Probe lines={[a, b]} />);
    rerender(<Probe lines={[a, b]} />);
    expect(seen).toEqual(["l1", "l2"]);
  });

  it("a spoken yes confirms the teach-back at once, without Singoda AI speaking again", async () => {
    const api = client();
    const agent: VoiceLine = { id: "l1", role: "agent", text: TEACHBACK, tMs: 900 };
    const { rerender } = render(<Harness lines={[]} api={api} />);
    await screen.findByText(TEACHBACK);
    rerender(<Harness lines={[agent]} api={api} />);
    rerender(
      <Harness
        lines={[agent, { id: "l2", role: "user", text: "Yes, that's right.", tMs: 950 }]}
        api={api}
      />,
    );
    await waitFor(() =>
      expect(api.confirmTeachBack).toHaveBeenCalledWith("s1", {
        tMs: 1000,
        confirmed: true,
        correctionSegmentIds: [],
      }),
    );
  });
});
