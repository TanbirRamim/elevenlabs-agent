import { test as base, type Page } from "@playwright/test";

/** A JSON message the page sent over a WebSocket. */
export interface SentFrame {
  url: string;
  message: unknown;
}

/**
 * Every test gets the voice stubbed: `/api/eleven/signed-url` answers 503, so the voice hook
 * reports an error instead of opening an ElevenLabs session. No ElevenLabs traffic in tests.
 */
export const test = base.extend<{ stubVoice: undefined }>({
  stubVoice: [
    async ({ page }, use) => {
      await page.route("**/api/eleven/signed-url**", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "voice_disabled_in_e2e" }),
        }),
      );
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

/**
 * Records every JSON frame the page sends over any WebSocket. Call before `page.goto` so the
 * session stream's first frames are not missed. Non-JSON frames are kept as raw strings.
 */
export function recordSentFrames(page: Page): SentFrame[] {
  const frames: SentFrame[] = [];
  page.on("websocket", (ws) => {
    ws.on("framesent", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      let message: unknown = text;
      try {
        message = JSON.parse(text);
      } catch {
        // keep the raw string
      }
      frames.push({ url: ws.url(), message });
    });
  });
  return frames;
}

/** `desk_event` frames whose event is an `action_committed`, as `{ ticketId, outcome }`. */
export function committedActions(frames: SentFrame[]): { ticketId: string; outcome: string }[] {
  const out: { ticketId: string; outcome: string }[] = [];
  for (const { message } of frames) {
    if (typeof message !== "object" || message === null) continue;
    const m = message as {
      type?: unknown;
      event?: { type?: unknown; ticketId?: unknown; outcome?: unknown };
    };
    if (m.type !== "desk_event" || m.event?.type !== "action_committed") continue;
    out.push({ ticketId: String(m.event.ticketId), outcome: String(m.event.outcome) });
  }
  return out;
}

/** Where the fake ElevenLabs conversation lives; never resolves on a real network. */
const FAKE_AGENT_URL = "wss://fake-elevenlabs.invalid/v1/convai/conversation";

/** A hidden control message (`[ASK] …`) the page sent to the voice agent. */
export interface ControlSent {
  prefix: string;
  body: string;
}

export interface FakeVoiceAgent {
  /** Every `user_message` the page sent, parsed into prefix and body. */
  readonly controls: ControlSent[];
  /** Contextual updates (`[SCREEN …]`) the page sent. */
  readonly contextual: string[];
  /** The expert says something: a final user transcript, as Scribe would deliver it. */
  say(text: string): void;
  /** Singoda AI says something out loud (an agent response line). */
  reply(text: string): void;
  /** The agent ends the call (its `end_call` tool): the server closes the conversation socket. */
  hangUp(): void;
  /** How many conversation sockets the page has opened; a reconnect would make this grow. */
  readonly connections: () => number;
}

/**
 * Replaces the stubbed voice with a fake ElevenAgents conversation: the signed-url route
 * answers with a URL Playwright intercepts, and the WebSocket speaks just enough of the
 * ConvAI protocol (`@elevenlabs/client` WebSocketConnection) for `useConversation` to connect.
 * Control messages are recorded; `[ASK]`, `[DEBRIEF]` and `[TEACHBACK]` are read back as
 * agent lines, like the real agent would say them. Call before `page.goto`.
 */
export async function fakeVoiceAgent(page: Page): Promise<FakeVoiceAgent> {
  const controls: ControlSent[] = [];
  const contextual: string[] = [];
  let send: ((m: object) => void) | null = null;
  let close: (() => void) | null = null;
  let connections = 0;
  let seq = 0;

  await page.unroute("**/api/eleven/signed-url**");
  await page.route("**/api/eleven/signed-url**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ signedUrl: FAKE_AGENT_URL }),
    }),
  );

  const agentLine = (text: string) => {
    seq += 1;
    send?.({
      type: "agent_response",
      agent_response_event: { agent_response: text, event_id: seq },
    });
  };

  await page.routeWebSocket(/fake-elevenlabs\.invalid/, (ws) => {
    let initiated = false;
    connections += 1;
    send = (m) => ws.send(JSON.stringify(m));
    close = () => void ws.close({ code: 1000, reason: "end_call" });
    ws.onMessage((raw) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      let msg: { type?: string; text?: string } = {};
      try {
        msg = JSON.parse(text) as typeof msg;
      } catch {
        return;
      }
      if (!initiated) {
        // The first client frame is conversation_initiation_client_data.
        initiated = true;
        ws.send(
          JSON.stringify({
            type: "conversation_initiation_metadata",
            conversation_initiation_metadata_event: {
              conversation_id: "conv_fake",
              agent_output_audio_format: "pcm_16000",
              user_input_audio_format: "pcm_16000",
            },
          }),
        );
        return;
      }
      if (msg.type === "contextual_update" && msg.text) contextual.push(msg.text);
      if (msg.type !== "user_message" || !msg.text) return;
      const match = /^(\[[A-Z]+\])\s?([\s\S]*)$/.exec(msg.text);
      if (!match) return;
      const [, prefix = "", body = ""] = match;
      controls.push({ prefix, body });
      if (prefix === "[ASK]" || prefix === "[TEACHBACK]") agentLine(body);
      if (prefix === "[DEBRIEF]") {
        const parsed = JSON.parse(body) as { questions: { text: string }[] };
        const first = parsed.questions[0];
        if (first) agentLine(first.text);
      }
    });
  });

  return {
    controls,
    contextual,
    say(text) {
      seq += 1;
      send?.({
        type: "user_transcript",
        user_transcription_event: { user_transcript: text, event_id: seq },
      });
    },
    reply: agentLine,
    hangUp() {
      close?.();
    },
    connections: () => connections,
  };
}

/** A JSON message the API pushed to the page over the session stream. */
export function recordReceivedFrames(page: Page): SentFrame[] {
  const frames: SentFrame[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      try {
        frames.push({ url: ws.url(), message: JSON.parse(text) });
      } catch {
        // not JSON
      }
    });
  });
  return frames;
}
