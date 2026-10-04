import {
  ClientMessage,
  CreateSessionRequest,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { isOffRecord, setOffRecord } from "../privacy/offRecord.js";
import type { Store } from "../store/memory.js";

export function registerSessionRoutes(app: FastifyInstance, store: Store): void {
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
      socket.on("close", () => {
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
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
            if (isOffRecord(session, m.tStartMs)) return; // dropped, never stored
            session.transcript.push({
              id: m.segmentId,
              tStartMs: m.tStartMs,
              tEndMs: m.tEndMs,
              speaker: m.speaker,
              text: m.text,
              offRecord: false,
            });
            return;
          case "desk_event": {
            if (isOffRecord(session, m.event.tMs)) return;
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
            hooks?.onDeskEvent(m.event, send, timers);
            return;
          }
          case "frame":
            if (isOffRecord(session, m.tMs)) return;
            // Frame pipeline (HAR-5, HAR-6): redact -> store keyframe -> vision -> curiosity.
            // Spec: docs/IMPLEMENTATION_PLAN.md §6.3.
            return;
          case "question_asked":
            return;
        }
      });
    },
  );
}
