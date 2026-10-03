import { visionExtractor } from "@shadow/prompts";
import { type ScreenEvent, VisionResult } from "@shadow/schema";
import { type LlmDeps, LlmError, structured } from "./structured.js";

export interface FrameInput {
  frameId: string;
  tMs: number;
  jpegBase64: string;
}

/**
 * Previous + current frame in, validated events out. On any model failure the frame is
 * marked unreadable rather than guessed at.
 */
export async function extractEvents(
  llm: LlmDeps,
  prev: FrameInput | null,
  cur: FrameInput,
  recent: ScreenEvent[],
): Promise<VisionResult> {
  const image = (f: FrameInput) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.jpegBase64 },
  });
  try {
    return await structured(llm, visionExtractor, VisionResult, [
      ...(prev ? [{ type: "text" as const, text: "PREVIOUS frame:" }, image(prev)] : []),
      { type: "text", text: `CURRENT frame (${cur.frameId}, t=${cur.tMs}ms):` },
      image(cur),
      {
        type: "text",
        text: `Recent events:\n${
          recent
            .slice(-5)
            .map((e) => `- ${e.summary}`)
            .join("\n") || "(none)"
        }`,
      },
    ]);
  } catch (err) {
    if (err instanceof LlmError) {
      return { events: [], decisionCandidate: false, screenAnswers: [], unreadable: true };
    }
    throw err;
  }
}
