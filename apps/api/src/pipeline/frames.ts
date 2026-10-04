import type { ClientMessage, Outcome, ScreenEvent, ServerMessage } from "@shadow/schema";
import type { LlmDeps } from "../llm/structured.js";
import { extractEvents, type FrameInput } from "../llm/vision.js";
import type { RedactImage } from "../privacy/presidioImage.js";
import type { ObjectStorage } from "../storage/types.js";
import type { SessionRecord } from "../store/memory.js";
import { createMetrics } from "./metrics.js";

type FrameMessage = Extract<ClientMessage, { type: "frame" }>;

/** Per-connection frame pipeline: redact -> store -> vision (on the redacted JPEG only). */
export interface FrameSink {
  onFrame(m: FrameMessage): void;
  /** DOM ground truth for the agreement metric (§6.3). */
  onDomAction(tMs: number, ticketId: string, outcome: Outcome): void;
  /** Last 5 facts the screen already answers — the Curiosity Engine must not ask these. */
  screenAnswers(): readonly string[];
  /** HAR-7 plugs the Gap Ledger count into the insight message here. */
  setOpenGaps(fn: () => number): void;
  stop(): void;
}

export interface FrameProcessorDeps {
  session: SessionRecord;
  send: (m: ServerMessage) => void;
  /** null: no ANTHROPIC_API_KEY — frames are stored but not seen by any model. */
  llm: LlmDeps | null;
  redactImage: RedactImage;
  /** null: no S3 — frames are not persisted (vision can still run). */
  storage: ObjectStorage | null;
  log: { warn: (obj: object, msg: string) => void };
  now?: () => number;
  insightIntervalMs?: number;
  /** Test seam; defaults to the real vision extractor. */
  extract?: typeof extractEvents;
}

export function createFrameProcessor({
  session,
  send,
  llm,
  redactImage,
  storage,
  log,
  now = () => Date.now(),
  insightIntervalMs = 5000,
  extract = extractEvents,
}: FrameProcessorDeps): FrameSink {
  const metrics = createMetrics();
  const answers: string[] = [];
  let prev: FrameInput | null = null;
  let pending: { frame: FrameInput; receivedAt: number } | null = null;
  let inFlight = false;
  let stopped = false;
  let openGapsFn: () => number = () => 0;

  const interval = setInterval(() => {
    send({
      type: "insight",
      visionLatencyMsP90: metrics.latencyP90(),
      visionUnreadableFrames: metrics.unreadableCount(),
      domVisionAgreement: metrics.agreement(),
      openGaps: openGapsFn(),
    });
  }, insightIntervalMs);

  async function runVision(frame: FrameInput, receivedAt: number): Promise<void> {
    if (!llm) return;
    inFlight = true;
    try {
      const result = await extract(llm, prev, frame, session.events.slice(-5));
      if (stopped) return;
      if (result.unreadable) {
        metrics.recordUnreadable();
      } else {
        prev = frame;
      }
      for (const event of result.events) {
        const ev: ScreenEvent = {
          id: `ev_${session.events.length + 1}`,
          tMs: frame.tMs,
          frameId: frame.frameId,
          source: "vision",
          summary: [event.kind, event.object, event.field, event.from, event.to, event.fact]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 240),
          payload: event as unknown as Record<string, unknown>,
        };
        session.events.push(ev);
        send({ type: "screen_event", event: ev });
        if (event.kind === "action") {
          metrics.recordVisionAction({
            tMs: frame.tMs,
            text: [event.object, event.field, event.from, event.to, event.fact]
              .filter(Boolean)
              .join(" "),
          });
        }
      }
      for (const answer of result.screenAnswers) {
        answers.push(answer);
        if (answers.length > 5) answers.shift();
      }
      if (result.events.length > 0) metrics.recordLatency(now() - receivedAt);
    } catch (err) {
      // extractEvents converts LlmError to unreadable; anything else is unexpected.
      log.warn(
        { sessionId: session.id, frameId: frame.frameId, err: String(err) },
        "vision failed",
      );
    } finally {
      inFlight = false;
      const next = pending;
      pending = null;
      if (next && !stopped) void runVision(next.frame, next.receivedAt);
    }
  }

  return {
    onFrame(m) {
      const receivedAt = now();
      void (async () => {
        const redacted = await redactImage(Buffer.from(m.jpegBase64, "base64"));
        if (stopped) return;
        if (!redacted) {
          // Never stored and never shown to a model.
          log.warn({ sessionId: session.id, frameId: m.frameId }, "frame dropped: not redactable");
          return;
        }
        if (storage) {
          await storage.put(`frames/${session.id}/${m.frameId}.jpg`, redacted, "image/jpeg");
          session.storedFrameIds.push(m.frameId);
        }
        if (!llm || stopped) return;
        const frame: FrameInput = {
          frameId: m.frameId,
          tMs: m.tMs,
          jpegBase64: redacted.toString("base64"),
        };
        // At most one vision call in flight; a newer frame replaces the waiting one.
        if (inFlight) {
          pending = { frame, receivedAt };
          return;
        }
        void runVision(frame, receivedAt);
      })().catch((err: unknown) => {
        log.warn(
          { sessionId: session.id, frameId: m.frameId, err: String(err) },
          "frame pipeline failed",
        );
      });
    },
    onDomAction(tMs, ticketId, outcome) {
      metrics.recordDomAction({ tMs, ticketId, outcome });
    },
    screenAnswers: () => answers,
    setOpenGaps(fn) {
      openGapsFn = fn;
    },
    stop() {
      stopped = true;
      pending = null;
      clearInterval(interval);
    },
  };
}
