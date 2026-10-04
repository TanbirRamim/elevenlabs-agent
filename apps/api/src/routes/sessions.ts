import {
  ClientMessage,
  CreateSessionRequest,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import type { CuriosityEngine } from "../curiosity/engine.js";
import type { StreamHooks } from "../mock/stream.js";
import type { FrameSink } from "../pipeline/frames.js";
import { isOffRecord, setOffRecord } from "../privacy/offRecord.js";
import { type RedactText, unavailableRedactor } from "../privacy/presidio.js";
import { ingestTranscript } from "../privacy/transcript.js";
import type { SessionRecord, Store } from "../store/memory.js";

/** Per-connection processors built by app.ts (frame pipeline + curiosity engine). */
export interface StreamPipes {
  sink?: FrameSink;
  curiosity?: CuriosityEngine;
}

/**
 * Where capture reads the screen from. "vision" (default): only what the model sees in the
 * redacted frames, so Shadow learns any app from a screen share; DeskSim DOM events are kept
 * as ground truth for the vision/DOM agreement metric only. "vision+desk": DOM events also
 * become session events and drive the Curiosity Engine (tests, DeskSim-only demos).
 */
export type CaptureSignals = "vision" | "vision+desk";

export interface SessionStreamDeps {
  /** Default "vision". */
  signals?: CaptureSignals;
  hooks?: StreamHooks;
  /** Defaults to the fail-safe placeholder redactor; app.ts wires the real one. */
  redactText?: RedactText;
  /** Per-connection pipeline factory. Absent: frames dropped, no questions planned. */
  pipes?: (session: SessionRecord, send: (m: ServerMessage) => void) => StreamPipes;
}

export function registerSessionRoutes(
  app: FastifyInstance,
  store: Store,
  { hooks, redactText = unavailableRedactor, pipes, signals = "vision" }: SessionStreamDeps = {},
): void {
  app.post("/sessions", async (req, reply) => {
    const body = CreateSessionRequest.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ code: "invalid_body", issues: body.error.issues });
    const s = store.createSession(body.data.mode, body.data.workMapId);
    return reply.code(201).send({ id: s.id, mode: s.mode });
  });

  app.get<{ Params: { id: string } }>(
    "/sessions/:id/stream",
    { websocket: true },
    (socket, req) => {
      const session = store.getSession(req.params.id);
      const send = (m: ServerMessage) => socket.send(JSON.stringify(m));
      if (!session) {
        send({ type: "error", code: "unknown_session", message: req.params.id });
        socket.close();
        return;
      }
      // Hook-scheduled sends (mock candidate questions) must not fire after close.
      const timers = new Set<NodeJS.Timeout>();
      const { sink, curiosity } = pipes?.(session, send) ?? {};
      socket.on("close", () => {
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        sink?.stop();
        curiosity?.stop();
      });

      socket.on("message", (raw: Buffer) => {
        let json: unknown;
        try {
          json = JSON.parse(raw.toString());
        } catch {
          send({ type: "error", code: "bad_json", message: "message is not JSON" });
          return;
        }
        const msg = ClientMessage.safeParse(json);
        if (!msg.success) {
          send({
            type: "error",
            code: "bad_message",
            message: msg.error.issues[0]?.message ?? "invalid",
          });
          return;
        }
        const m = msg.data;
        switch (m.type) {
          case "hello":
            send({ type: "ready", protocol: PROTOCOL_VERSION });
            return;
          case "off_record":
            setOffRecord(session, m.on, m.tMs);
            return;
          case "transcript":
            void ingestTranscript(session, m, redactText)
              .then((stored) => {
                if (stored) curiosity?.onTranscript(stored);
              })
              .catch((err: unknown) => {
                req.log.warn({ sessionId: session.id, err }, "transcript ingest failed");
              });
            return;
          case "desk_event": {
            if (isOffRecord(session, m.event.tMs)) return;
            // Ground truth for the agreement metric in every mode.
            if (m.event.type === "action_committed") {
              sink?.onDomAction(m.event.tMs, m.event.ticketId, m.event.outcome);
            }
            hooks?.onDeskEvent(m.event, send, timers);
            if (signals === "vision") return;
            const ev = {
              id: `ev_${session.events.length + 1}`,
              tMs: m.event.tMs,
              frameId: "dom",
              source: "dom" as const,
              summary: JSON.stringify(m.event).slice(0, 240),
              payload: m.event as Record<string, unknown>,
            };
            session.events.push(ev);
            send({ type: "screen_event", event: ev });
            curiosity?.onDeskEvent(m.event);
            return;
          }
          case "frame":
            if (isOffRecord(session, m.tMs)) return;
            sink?.onFrame(m);
            return;
          case "question_asked":
            curiosity?.onQuestionAsked(m.questionId, m.tMs);
            return;
        }
      });
    },
  );
}
