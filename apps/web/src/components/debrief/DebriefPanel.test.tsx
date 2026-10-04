// @vitest-environment jsdom
import type { DebriefStatus } from "@shadow/schema";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../lib/api";
import { sampleWorkMap } from "../workmap/fixture";
import { DebriefPanel } from "./DebriefPanel";
import type { DebriefApi, DebriefVoice } from "./useDebrief";

afterEach(cleanup);

const workMap = sampleWorkMap;

const questions = [
  { id: "q1", slot: "guardrail" as const, text: "Refund limit?", priority: 0.8 },
  { id: "q2", slot: "exception" as const, text: "Known bug?", priority: 0.7 },
  { id: "q3", slot: "escalation_contact" as const, text: "Who handles Security?", priority: 0.65 },
];

const noVoice: DebriefVoice = { connected: false, transcript: [], speak: () => false };

function fakeClient(overrides: Partial<DebriefApi> = {}): DebriefApi {
  let asked = 0;
  return {
    endSession: vi.fn(async () => ({ workMapId: "wm_1", coverage: 0.6, openQuestions: questions })),
    answerDebrief: vi.fn(async (): Promise<DebriefStatus> => {
      asked += 1;
      const open = questions.slice(asked);
      return { coverage: 0.6 + asked * 0.15, openQuestions: open, asked, done: asked >= 3 };
    }),
    requestTeachBack: vi.fn(async () => ({ text: "You refund small charges yourself." })),
    confirmTeachBack: vi.fn(async (_id, body) =>
      body.confirmed
        ? { workMap: { ...workMap, teachBackConfirmedAtMs: 462_000 } }
        : { workMap, recheckText: "So above 500 euros, Legal signs off." },
    ),
    getPredictionVariants: vi.fn(async () => ({
      variants: [
        {
          id: "v1",
          description: "T3 without the chargeback tag",
          predictedOutcome: "refund" as const,
          becauseStepId: "S2",
        },
      ],
    })),
    ...overrides,
  };
}

function setup(client: DebriefApi) {
  let n = 0;
  const sendTypedLine = vi.fn(() => `typed${++n}`);
  render(
    <DebriefPanel
      sessionId="s1"
      voice={noVoice}
      clock={() => 1000}
      isSent={() => true}
      sendTypedLine={sendTypedLine}
      client={client}
    />,
  );
  return { sendTypedLine };
}

async function typeAnswer(label: RegExp, text: string, button: string) {
  fireEvent.change(await screen.findByLabelText(label), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: button }));
}

describe("DebriefPanel without voice", () => {
  it("runs questions, a corrected teach-back and the prediction check by typing and clicking", async () => {
    const client = fakeClient();
    setup(client);

    for (const q of questions) {
      await screen.findByText(q.text);
      await waitFor(() =>
        expect(screen.getByText(q.text).closest("li")?.getAttribute("aria-current")).toBe("step"),
      );
      await typeAnswer(/your answer/i, `answer to ${q.id}`, "Send answer");
    }
    expect(client.answerDebrief).toHaveBeenCalledTimes(3);
    expect(client.answerDebrief).toHaveBeenNthCalledWith(1, "s1", {
      questionId: "q1",
      segmentIds: ["typed1"],
    });

    await screen.findByText("You refund small charges yourself.");
    fireEvent.click(screen.getByRole("button", { name: "Correct it" }));
    await typeAnswer(/what did shadow get wrong/i, "Above 500 Legal signs off", "Send correction");
    await screen.findByText("So above 500 euros, Legal signs off.");
    expect(client.confirmTeachBack).toHaveBeenLastCalledWith("s1", {
      tMs: 1000,
      confirmed: false,
      correctionSegmentIds: ["typed4"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Yes, that's right" }));
    await screen.findByText("T3 without the chargeback tag");
    fireEvent.click(screen.getByRole("button", { name: "Right" }));

    expect(await screen.findByText(/Confirmed at/)).toBeTruthy();
    expect(screen.getByText("07:42")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the Work Map" }).getAttribute("href")).toBe(
      "/map/wm_1?session=s1",
    );
  });

  it("shows a clear message for a missing endpoint and lets the expert continue", async () => {
    const missing = (path: string) =>
      new ApiClientError("http", {
        status: 404,
        method: "POST",
        path,
        body: { code: "not_found" },
      });
    const client = fakeClient({
      endSession: vi.fn(async () => ({ workMapId: "wm_1", coverage: 0.9, openQuestions: [] })),
      requestTeachBack: vi.fn(async () => {
        throw missing("/sessions/s1/teachback");
      }),
      getPredictionVariants: vi.fn(async () => {
        throw missing("/workmaps/wm_1/predictions");
      }),
    });
    setup(client);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "does not serve POST /sessions/s1/teachback (404, not_found)",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue without it" }));
    expect((await screen.findByRole("alert")).textContent).toContain("/workmaps/wm_1/predictions");
    fireEvent.click(screen.getByRole("button", { name: "Finish without it" }));
    expect(await screen.findByText("Teach-back not confirmed")).toBeTruthy();
    expect(screen.queryByText("Prediction check")).toBeNull();
  });

  it("retries a failed answer", async () => {
    const answer = vi
      .fn<DebriefApi["answerDebrief"]>()
      .mockRejectedValueOnce(
        new ApiClientError("network", { status: 0, method: "POST", path: "/x" }),
      )
      .mockResolvedValue({ coverage: 0.95, openQuestions: [], asked: 3, done: true });
    setup(fakeClient({ answerDebrief: answer }));
    await typeAnswer(/your answer/i, "a", "Send answer");
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("You refund small charges yourself.");
    expect(answer).toHaveBeenCalledTimes(2);
  });
});

describe("DebriefPanel with voice", () => {
  it("advances on spoken answers and a spoken yes, and tells the agent what to say", async () => {
    const client = fakeClient({
      endSession: vi.fn(async () => ({
        workMapId: "wm_1",
        coverage: 0.8,
        openQuestions: [questions[0] as (typeof questions)[number]],
      })),
      answerDebrief: vi.fn(async () => ({
        coverage: 0.95,
        openQuestions: [],
        asked: 3,
        done: true,
      })),
    });
    const speak = vi.fn(() => true);
    const lines: DebriefVoice["transcript"][number][] = [];
    const panel = (transcript: DebriefVoice["transcript"]) => (
      <DebriefPanel
        sessionId="s1"
        voice={{ connected: true, transcript, speak }}
        clock={() => 2000}
        isSent={() => true}
        sendTypedLine={() => null}
        client={client}
      />
    );
    const { rerender } = render(panel([]));
    const say = (role: "user" | "agent", text: string) => {
      lines.push({ id: `l${lines.length}`, role, text });
      rerender(panel([...lines]));
    };

    await screen.findByText("Refund limit?");
    expect(speak).toHaveBeenCalledWith("[DEBRIEF]", {
      questions: [{ id: "q1", slot: "guardrail", text: "Refund limit?" }],
    });
    say("agent", "Is there a refund limit?");
    say("user", "Above 500 euros Legal signs off.");
    say("agent", "Thanks, that helps.");
    await waitFor(() =>
      expect(client.answerDebrief).toHaveBeenCalledWith("s1", {
        questionId: "q1",
        segmentIds: ["l1"],
      }),
    );

    await screen.findByText("You refund small charges yourself.");
    expect(speak).toHaveBeenCalledWith("[TEACHBACK]", "You refund small charges yourself.");
    say("agent", "Is that how it works?");
    say("user", "Yes, that's right.");
    await waitFor(() =>
      expect(client.confirmTeachBack).toHaveBeenCalledWith("s1", {
        tMs: 2000,
        confirmed: true,
        correctionSegmentIds: [],
      }),
    );

    await screen.findByText("T3 without the chargeback tag");
    await waitFor(() =>
      expect(speak).toHaveBeenLastCalledWith(
        "[TEACHBACK]",
        expect.stringMatching(
          /^Prediction 1 of 1: T3 without the chargeback tag\. I would refund it/,
        ),
      ),
    );
    say("user", "No, that goes to Security.");
    expect(await screen.findByText(/Confirmed at/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wrong" }).getAttribute("aria-pressed")).toBe("true");
  });
});
