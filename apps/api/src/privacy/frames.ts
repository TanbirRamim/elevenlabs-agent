import type { ClientMessage } from "@shadow/schema";
import type { ObjectStorage } from "../storage/types.js";
import type { SessionRecord } from "../store/memory.js";
import type { RedactImage } from "./presidioImage.js";

type FrameMessage = Extract<ClientMessage, { type: "frame" }>;

export type StoreFrame = (session: SessionRecord, m: FrameMessage) => Promise<void>;

/**
 * Frame storage path: redact, then store at frames/<sessionId>/<frameId>.jpg.
 * A frame that cannot be redacted is dropped — never stored unredacted.
 */
export function createFramePipeline(
  redactImage: RedactImage,
  storage: ObjectStorage,
  log: { warn: (obj: object, msg: string) => void },
): StoreFrame {
  return async (session, m) => {
    const redacted = await redactImage(Buffer.from(m.jpegBase64, "base64"));
    if (!redacted) {
      log.warn({ sessionId: session.id, frameId: m.frameId }, "frame dropped: not redactable");
      return;
    }
    await storage.put(`frames/${session.id}/${m.frameId}.jpg`, redacted, "image/jpeg");
    session.storedFrameIds.push(m.frameId);
  };
}
