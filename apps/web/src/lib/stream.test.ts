import { PROTOCOL_VERSION, type ServerMessage } from "@shadow/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  backoffDelayMs,
  SessionStream,
  type StreamState,
  type WebSocketLike,
} from "./stream";

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  static get last(): FakeWebSocket {
    const last = FakeWebSocket.instances.at(-1);
    if (!last) throw new Error("no FakeWebSocket created");
    return last;
  }

  readyState = 0;
  readonly sent: string[] = [];
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  closedWith: number | undefined;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error("send on a socket that is not open");
    this.sent.push(data);
  }

  close(code?: number): void {
    this.readyState = 3;
    this.closedWith = code;
    this.onclose?.({ code });
  }

  // Test helpers: what the server or network does.
  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  serverSend(message: unknown): void {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  sentJson(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const screenEvent: ServerMessage = {
  type: "screen_event",
  event: {
    id: "e1",
    tMs: 12_000,
    frameId: "f1",
    source: "dom",
    summary: "Opened ticket T3",
    payload: { ticketId: "T3" },
  },
};

function open(sessionId = "s1") {
  const states: StreamState[] = [];
  const stream = new SessionStream({
    sessionId,
    baseUrl: "ws://api.test",
    WebSocket: FakeWebSocket,
    random: () => 0,
  });
  stream.onState((s) => states.push(s));
  return { stream, states };
}

describe("SessionStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects to /sessions/:id/stream and sends hello on open", () => {
    const { stream, states } = open("s 1");
    expect(stream.state).toBe("connecting");
    const ws = FakeWebSocket.last;
    expect(ws.url).toBe("ws://api.test/sessions/s%201/stream");
    ws.serverOpen();
    expect(stream.state).toBe("open");
    expect(states).toEqual(["open"]);
    expect(ws.sentJson()).toEqual([
      { type: "hello", protocol: PROTOCOL_VERSION, sessionId: "s 1" },
    ]);
    stream.close();
  });

  it("dispatches validated screen_event messages to subscribers and supports unsubscribe", () => {
    const { stream } = open();
    const ws = FakeWebSocket.last;
    ws.serverOpen();
    const seen: ServerMessage[] = [];
    const off = stream.on("screen_event", (m) => seen.push(m));
    const other = vi.fn();
    stream.on("candidate_question", other);

    ws.serverSend(screenEvent);
    expect(seen).toEqual([screenEvent]);
    expect(other).not.toHaveBeenCalled();

    off();
    ws.serverSend(screenEvent);
    expect(seen).toHaveLength(1);
    stream.close();
  });

  it("drops and counts messages that fail ServerMessage validation", () => {
    const { stream } = open();
    const ws = FakeWebSocket.last;
    ws.serverOpen();
    const handler = vi.fn();
    stream.on("screen_event", handler);

    ws.serverSend("not json");
    ws.serverSend({ type: "screen_event", event: { kind: "nope" } });
    ws.serverSend({ type: "unknown_type" });
    ws.serverSend({ type: "ready", protocol: PROTOCOL_VERSION + 1 });
    ws.serverSend(screenEvent);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(stream.stats.droppedIncoming).toBe(4);
    stream.close();
  });

  it("validates outgoing messages before sending", () => {
    const { stream } = open();
    FakeWebSocket.last.serverOpen();
    expect(() =>
      stream.send({ type: "off_record", on: true, tMs: -1 } as unknown as never),
    ).toThrow();
    stream.send({ type: "off_record", on: true, tMs: 1_000 });
    expect(FakeWebSocket.last.sentJson().at(-1)).toEqual({
      type: "off_record",
      on: true,
      tMs: 1_000,
    });
    stream.close();
  });

  it("queues messages until open and flushes them after hello, dropping the oldest when full", () => {
    const stream = new SessionStream({
      sessionId: "s1",
      baseUrl: "ws://api.test",
      WebSocket: FakeWebSocket,
      random: () => 0,
      queueLimit: 2,
    });
    stream.send({ type: "off_record", on: true, tMs: 1 });
    stream.send({ type: "off_record", on: true, tMs: 2 });
    stream.send({ type: "off_record", on: true, tMs: 3 });
    expect(stream.stats.queued).toBe(2);
    expect(stream.stats.droppedOutgoing).toBe(1);

    const ws = FakeWebSocket.last;
    expect(ws.sent).toHaveLength(0);
    ws.serverOpen();
    expect(ws.sentJson()).toEqual([
      { type: "hello", protocol: PROTOCOL_VERSION, sessionId: "s1" },
      { type: "off_record", on: true, tMs: 2 },
      { type: "off_record", on: true, tMs: 3 },
    ]);
    expect(stream.stats.queued).toBe(0);
    stream.close();
  });

  it("reconnects after an unexpected close with exponential backoff and re-sends hello", () => {
    const { stream, states } = open();
    const first = FakeWebSocket.last;
    first.serverOpen();
    first.serverClose();
    expect(stream.state).toBe("reconnecting");
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // Second failure doubles the wait.
    FakeWebSocket.last.serverClose();
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    // Third failure: 2 s.
    FakeWebSocket.last.serverClose();
    vi.advanceTimersByTime(2_000);
    expect(FakeWebSocket.instances).toHaveLength(4);

    const reconnected = FakeWebSocket.last;
    reconnected.serverOpen();
    expect(stream.state).toBe("open");
    expect(reconnected.sentJson()).toEqual([
      { type: "hello", protocol: PROTOCOL_VERSION, sessionId: "s1" },
    ]);
    expect(stream.stats.reconnects).toBe(3);
    expect(states).toEqual(["open", "reconnecting", "open"]);

    // A later failure starts again from the minimum delay.
    reconnected.serverClose();
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(5);
    stream.close();
  });

  it("caps the backoff at 8 s and adds bounded jitter", () => {
    expect(backoffDelayMs(0, () => 0)).toBe(BACKOFF_MIN_MS);
    expect(backoffDelayMs(1, () => 0)).toBe(1_000);
    expect(backoffDelayMs(4, () => 0)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelayMs(10, () => 0)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelayMs(0, () => 0.5)).toBe(BACKOFF_MIN_MS + 62);
    expect(backoffDelayMs(10, () => 0.999)).toBe(BACKOFF_MAX_MS);
  });

  it("does not reconnect after close() and rejects further sends", () => {
    const { stream, states } = open();
    const ws = FakeWebSocket.last;
    ws.serverOpen();
    stream.close();
    expect(stream.state).toBe("closed");
    expect(ws.closedWith).toBe(1000);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(states).toEqual(["open", "closed"]);
    expect(() => stream.send({ type: "off_record", on: false, tMs: 5 })).toThrow();
  });

  it("ignores events from a socket it has already replaced", () => {
    const { stream } = open();
    const first = FakeWebSocket.last;
    first.serverOpen();
    first.serverClose();
    vi.advanceTimersByTime(500);
    const second = FakeWebSocket.last;
    const handler = vi.fn();
    stream.on("screen_event", handler);
    first.onmessage?.({ data: JSON.stringify(screenEvent) });
    expect(handler).not.toHaveBeenCalled();
    second.serverOpen();
    second.serverSend(screenEvent);
    expect(handler).toHaveBeenCalledTimes(1);
    stream.close();
  });
});
