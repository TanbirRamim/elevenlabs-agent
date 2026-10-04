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
