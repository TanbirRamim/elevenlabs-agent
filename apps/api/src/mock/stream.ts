import type { DeskEvent, ServerMessage } from "@shadow/schema";
import type { MockFixtures } from "./fixtures.js";

/** Hooks a session WebSocket can offer to mock mode (per-connection timers for cleanup). */
export interface StreamHooks {
  onDeskEvent(
    event: DeskEvent,
    send: (m: ServerMessage) => void,
    timers: Set<NodeJS.Timeout>,
  ): void;
}

/**
 * MOCK_AI replacement for the vision + curiosity pipeline: every committed action
 * answers with the fixture question for that ticket, 3 s later (as the real engine would).
 */
export function createMockStreamHooks(fixtures: MockFixtures): StreamHooks {
  return {
    onDeskEvent(event, send, timers) {
      if (event.type !== "action_committed") return;
      const question = fixtures.questions[event.ticketId];
      if (!question) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        send({
          type: "candidate_question",
          // The fixture stores createdAtMs: 0; stamp it on the session clock so
          // the Turn Gate's staleness check sees a fresh candidate.
          question: { ...question, createdAtMs: event.tMs + 3000 },
        });
      }, 3000);
      timers.add(timer);
    },
  };
}
