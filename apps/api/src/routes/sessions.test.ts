import websocket from "@fastify/websocket";
import type { DeskEvent } from "@shadow/schema";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CuriosityEngine } from "../curiosity/engine.js";
import type { FrameSink } from "../pipeline/frames.js";
import { createMemoryStore } from "../store/memory.js";
import { type CaptureSignals, registerSessionRoutes } from "./sessions.js";

const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
});

async function run(signals: CaptureSignals | undefined) {
  const store = createMemoryStore();
  const onDomAction = vi.fn();
  const onDeskEvent = vi.fn();
  const app = Fastify();
  apps.push(app);
  await app.register(websocket);
  registerSessionRoutes(app, store, {
    ...(signals ? { signals } : {}),
    redactText: async (t) => t,
    pipes: () => ({
      sink: { onDomAction, onFrame: vi.fn(), stop: vi.fn() } as unknown as FrameSink,
      curiosity: { onDeskEvent, stop: vi.fn() } as unknown as CuriosityEngine,
    }),
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as { port: number };
  const session = store.createSession("capture");
  const ws = new WebSocket(`ws://127.0.0.1:${port}/sessions/${session.id}/stream`);
  const received: string[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("ws error"));
  });
  ws.onmessage = (e) => received.push(String(e.data));
  const event: DeskEvent = {
    type: "action_committed",
    tMs: 5000,
    ticketId: "T3",
    outcome: "handoff_billing_disputes",
  };
  ws.send(JSON.stringify({ type: "desk_event", event }));
  ws.send(JSON.stringify({ type: "hello", protocol: 1, sessionId: session.id }));
  // "ready" answers the hello, so the desk_event before it has been handled.
  await vi.waitFor(() => expect(received.some((r) => r.includes('"ready"'))).toBe(true));
  ws.close();
  return { session, onDomAction, onDeskEvent, received };
}

describe("capture signals", () => {
  it('"vision" (default): a desk_event only scores agreement, it never becomes evidence', async () => {
    const { session, onDomAction, onDeskEvent, received } = await run(undefined);
    expect(onDomAction).toHaveBeenCalledWith(5000, "T3", "handoff_billing_disputes");
    expect(onDeskEvent).not.toHaveBeenCalled();
    expect(session.events).toHaveLength(0);
    expect(received.some((r) => r.includes("screen_event"))).toBe(false);
  });

  it('"vision+desk": the desk_event also drives the curiosity engine and the map', async () => {
    const { session, onDomAction, onDeskEvent } = await run("vision+desk");
    expect(onDomAction).toHaveBeenCalledTimes(1);
    expect(onDeskEvent).toHaveBeenCalledTimes(1);
    expect(session.events[0]?.source).toBe("dom");
  });
});
