import { ClientMessage, PROTOCOL_VERSION, type ServerMessage } from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isOffRecord, setOffRecord } from "../privacy/offRecord.js";
import type { Store } from "../store/memory.js";

const CreateSession = z.object({ mode: z.enum(["capture", "teach"]) });

export function registerSessionRoutes(app: FastifyInstance, store: Store): void {
  app.post("/sessions", async (req, reply) => {
    const body = CreateSession.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ code: "invalid_body", issues: body.error.issues });
    const s = store.createSession(body.data.mode);
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
