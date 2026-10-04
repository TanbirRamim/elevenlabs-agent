import type { ServerMessage, VisionResult } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import type { LlmDeps } from "../llm/structured.js";
import type { FrameInput } from "../llm/vision.js";
import { createMemoryObjectStorage } from "../storage/memory.js";
import { createMemoryStore } from "../store/memory.js";
import { createFrameProcessor, type FrameProcessorDeps } from "./frames.js";

const log = { warn: vi.fn() };
const fakeLlm = { client: {}, model: "test" } as unknown as LlmDeps;

function frameMsg(frameId: string, tMs: number) {
  return {
    type: "frame" as const,
    tMs,
    frameId,
    jpegBase64: Buffer.from(`raw-${frameId}`).toString("base64"),
    phash: "0".repeat(16),
  };
}

function okResult(over: Partial<VisionResult> = {}): VisionResult {
  return { events: [], decisionCandidate: false, screenAnswers: [], unreadable: false, ...over };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flush() {
  // drain microtasks queued by the pipeline's fire-and-forget promises
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function setup(over: Partial<FrameProcessorDeps> = {}) {
  const session = createMemoryStore().createSession("capture");
  const storage = createMemoryObjectStorage();
  const sent: ServerMessage[] = [];
  const deps: FrameProcessorDeps = {
    session,
    send: (m) => sent.push(m),
    llm: fakeLlm,
    redactImage: async (jpeg) => Buffer.from(`redacted-${jpeg.toString()}`),
    storage,
    log,
    extract: async () => okResult(),
    ...over,
  };
  const sink = createFrameProcessor(deps);
  return { session, storage, sent, sink };
}

describe("createFrameProcessor", () => {
  it("redacts, stores, and runs vision on the redacted jpeg", async () => {
    const seen: string[] = [];
    const { session, storage, sent, sink } = setup({
      extract: async (_llm, _prev, cur) => {
        seen.push(Buffer.from(cur.jpegBase64, "base64").toString());
        return okResult({
          events: [{ kind: "opened", object: "ticket T1" }],
          screenAnswers: ["T1 amount is visible"],
        });
      },
    });
    sink.onFrame(frameMsg("f1", 1000));
    await flush();

    expect(storage.objects.has(`frames/${session.id}/f1.jpg`)).toBe(true);
    expect(session.storedFrameIds).toEqual(["f1"]);
    expect(seen[0]).toContain("redacted-"); // vision never sees the raw jpeg
    const events = sent.filter(
      (m): m is Extract<ServerMessage, { type: "screen_event" }> => m.type === "screen_event",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.event.source).toBe("vision");
    expect(events[0]?.event.frameId).toBe("f1");
    expect(sink.screenAnswers()).toEqual(["T1 amount is visible"]);
    sink.stop();
  });

  it("drops the frame when redaction fails: nothing stored, no vision", async () => {
    const extract = vi.fn(async () => okResult());
    const { storage, sink, session } = setup({ redactImage: async () => null, extract });
    sink.onFrame(frameMsg("f1", 1000));
    await flush();
    expect(storage.objects.size).toBe(0);
    expect(session.storedFrameIds).toEqual([]);
    expect(extract).not.toHaveBeenCalled();
    sink.stop();
  });

  it("stores but skips vision without an llm", async () => {
    const extract = vi.fn(async () => okResult());
    const { storage, sink, session } = setup({ llm: null, extract });
    sink.onFrame(frameMsg("f1", 1000));
    await flush();
    expect(storage.objects.size).toBe(1);
    expect(session.storedFrameIds).toEqual(["f1"]);
    expect(extract).not.toHaveBeenCalled();
    sink.stop();
  });

  it("keeps one vision call in flight and only the newest pending frame", async () => {
    const calls: { frameId: string; prev: string | null }[] = [];
    const first = deferred<VisionResult>();
    const { sink } = setup({
      extract: async (_llm, prev: FrameInput | null, cur: FrameInput) => {
        calls.push({ frameId: cur.frameId, prev: prev?.frameId ?? null });
        if (cur.frameId === "f1") return first.promise;
        return okResult();
      },
    });

    sink.onFrame(frameMsg("f1", 1000));
    await flush();
    sink.onFrame(frameMsg("f2", 2000)); // waits
    await flush();
    sink.onFrame(frameMsg("f3", 3000)); // replaces f2
    await flush();
    expect(calls.map((c) => c.frameId)).toEqual(["f1"]);

    first.resolve(okResult());
    await flush();
    expect(calls.map((c) => c.frameId)).toEqual(["f1", "f3"]); // f2 never ran
    expect(calls[1]?.prev).toBe("f1"); // prev advanced to the last readable frame
    sink.stop();
  });

  it("counts unreadable frames and keeps prev unchanged", async () => {
    const calls: (string | null)[] = [];
    const { sink, sent } = setup({
      insightIntervalMs: 50,
      extract: async (_llm, prev: FrameInput | null, cur: FrameInput) => {
        calls.push(prev?.frameId ?? null);
        return cur.frameId === "f1" ? okResult({ unreadable: true }) : okResult();
      },
    });
    sink.onFrame(frameMsg("f1", 1000));
    await flush();
    sink.onFrame(frameMsg("f2", 2000));
    await flush();
    expect(calls).toEqual([null, null]); // f1 unreadable -> not used as prev
    await new Promise((r) => setTimeout(r, 80));
    const insight = sent.find(
      (m): m is Extract<ServerMessage, { type: "insight" }> => m.type === "insight",
    );
    expect(insight?.visionUnreadableFrames).toBe(1);
    sink.stop();
  });

  it("emits insight on an interval and stops cleanly", async () => {
    vi.useFakeTimers();
    try {
      const { sent, sink } = setup({ llm: null });
      sink.setOpenGaps(() => 4);
      vi.advanceTimersByTime(10_000);
      const insights = sent.filter(
        (m): m is Extract<ServerMessage, { type: "insight" }> => m.type === "insight",
      );
      expect(insights).toHaveLength(2);
      expect(insights[0]).toMatchObject({
        visionLatencyMsP90: null,
        visionUnreadableFrames: 0,
        domVisionAgreement: null,
        openGaps: 4,
      });
      sink.stop();
      vi.advanceTimersByTime(10_000);
      expect(sent.filter((m) => m.type === "insight")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("feeds DOM actions into the agreement metric", async () => {
    vi.useFakeTimers();
    try {
      const { sink, sent } = setup({
        extract: async () =>
          okResult({
            events: [{ kind: "action", object: "ticket T3", to: "Handoff: Billing disputes" }],
          }),
      });
      sink.onFrame(frameMsg("f1", 10_500));
      await vi.advanceTimersByTimeAsync(0);
      sink.onDomAction(10_000, "T3", "handoff_billing_disputes");
      vi.advanceTimersByTime(5000);
      const insight = sent.find(
        (m): m is Extract<ServerMessage, { type: "insight" }> => m.type === "insight",
      );
      expect(insight?.domVisionAgreement).toBe(1);
      sink.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores an older frame whose redaction finishes after a newer one", async () => {
    const slowFirst = deferred<Buffer>();
    const seen: string[] = [];
    const { sink, session, storage } = setup({
      redactImage: (jpeg) =>
        jpeg.toString() === "raw-f1"
          ? slowFirst.promise
          : Promise.resolve(Buffer.from(`redacted-${jpeg.toString()}`)),
      extract: async (_llm, _prev, cur) => {
        seen.push(cur.frameId);
        return okResult();
      },
    });
    sink.onFrame(frameMsg("f1", 1000));
    sink.onFrame(frameMsg("f2", 2500));
    await flush();
    slowFirst.resolve(Buffer.from("redacted-raw-f1"));
    await flush();
    expect(seen).toEqual(["f2"]); // f1 is stale: never sent to vision after f2
    expect(storage.objects.has(`frames/${session.id}/f1.jpg`)).toBe(true); // still stored as evidence
    sink.stop();
  });
});
