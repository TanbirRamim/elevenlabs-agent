import { describe, expect, it, vi } from "vitest";
import { createMemoryObjectStorage } from "../storage/memory.js";
import { createMemoryStore } from "../store/memory.js";
import { createFramePipeline } from "./frames.js";

const log = { warn: vi.fn() };
const frame = {
  type: "frame" as const,
  tMs: 1000,
  frameId: "f_1",
  jpegBase64: Buffer.from("raw jpeg bytes").toString("base64"),
  phash: "0".repeat(16),
};

describe("createFramePipeline", () => {
  it("stores only the redacted bytes under frames/<sessionId>/<frameId>.jpg", async () => {
    const storage = createMemoryObjectStorage();
    const session = createMemoryStore().createSession("capture");
    const redacted = Buffer.from("redacted jpeg bytes");
    const storeFrame = createFramePipeline(async () => redacted, storage, log);

    await storeFrame(session, frame);

    const stored = storage.objects.get(`frames/${session.id}/f_1.jpg`);
    expect(stored?.body.equals(redacted)).toBe(true);
    expect(stored?.contentType).toBe("image/jpeg");
    expect(session.storedFrameIds).toEqual(["f_1"]);
  });

  it("drops the frame entirely when redaction is unavailable", async () => {
    const storage = createMemoryObjectStorage();
    const put = vi.spyOn(storage, "put");
    const session = createMemoryStore().createSession("capture");
    const storeFrame = createFramePipeline(async () => null, storage, log);

    await storeFrame(session, frame);

    expect(put).not.toHaveBeenCalled();
    expect(storage.objects.size).toBe(0);
    expect(session.storedFrameIds).toEqual([]);
  });
});
