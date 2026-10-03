import { ClientMessage, Id, PROTOCOL_VERSION, ServerMessage } from "@shadow/schema";
import { publicEnv } from "../env";

/**
 * WebSocket client for `/sessions/:id/stream` (contract: `packages/schema/src/protocol.ts`).
 * Sends `hello` on every (re)connect, validates every incoming `ServerMessage` and every outgoing
 * `ClientMessage`, reconnects with exponential backoff (500 ms -> 8 s) until `close()` is called,
 * and queues outgoing messages while the socket is not open. All WebSocket traffic from the web
 * app goes through here.
 */

export type StreamState = "connecting" | "open" | "reconnecting" | "closed";

export type ServerMessageType = ServerMessage["type"];
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;
export type StreamHandler<T extends ServerMessageType> = (message: ServerMessageOf<T>) => void;
export type Unsubscribe = () => void;

/** The subset of the DOM `WebSocket` the client relies on, so tests can inject a fake. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
export type WebSocketConstructor = new (url: string) => WebSocketLike;

/** `WebSocket.OPEN` without depending on the global constant existing in tests. */
const WS_OPEN = 1;

export const BACKOFF_MIN_MS = 500;
export const BACKOFF_MAX_MS = 8_000;
export const QUEUE_LIMIT = 200;

export interface SessionStreamOptions {
  sessionId: string;
  /** Defaults to `publicEnv.apiWsUrl`. */
  baseUrl?: string;
  /** Injectable for tests; defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** Jitter source in [0, 1); defaults to `Math.random`. Tests pass `() => 0`. */
  random?: () => number;
  /** Outgoing messages buffered while not open; oldest are dropped beyond this. */
  queueLimit?: number;
}

export interface StreamStats {
  readonly state: StreamState;
  /** Incoming messages that failed `ServerMessage` validation and were dropped. */
  readonly droppedIncoming: number;
  /** Outgoing messages dropped because the offline queue was full. */
  readonly droppedOutgoing: number;
  readonly queued: number;
  readonly reconnects: number;
}

/** Handlers are stored erased to the union; `on()` is the only writer and keeps keys and types paired. */
type AnyHandler = (message: ServerMessage) => void;
type HandlerMap = Map<ServerMessageType, Set<AnyHandler>>;
type Timer = ReturnType<typeof setTimeout>;

export function streamUrl(sessionId: string, baseUrl: string = publicEnv.apiWsUrl): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/sessions/${encodeURIComponent(Id.parse(sessionId))}/stream`;
}

/** Delay before reconnect attempt `attempt` (0-based): min * 2^attempt, capped, plus up to 25% jitter. */
export function backoffDelayMs(
  attempt: number,
  random: () => number = Math.random,
  minMs: number = BACKOFF_MIN_MS,
  maxMs: number = BACKOFF_MAX_MS,
): number {
  const base = Math.min(maxMs, minMs * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.min(Math.max(random(), 0), 0.999_999) * base * 0.25);
  return Math.min(maxMs, base + jitter);
}

export class SessionStream {
  readonly sessionId: string;
  readonly url: string;

  private readonly WebSocketImpl: WebSocketConstructor;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly random: () => number;
  private readonly queueLimit: number;

  private socket: WebSocketLike | null = null;
  private currentState: StreamState = "connecting";
  private closedByCaller = false;
  private reconnectTimer: Timer | null = null;
  private attempt = 0;

  private readonly queue: string[] = [];
  private readonly handlers: HandlerMap = new Map();
  private readonly stateListeners = new Set<(state: StreamState) => void>();

  private droppedIncomingCount = 0;
  private droppedOutgoingCount = 0;
  private reconnectCount = 0;

  constructor(options: SessionStreamOptions) {
    this.sessionId = Id.parse(options.sessionId);
    this.url = streamUrl(this.sessionId, options.baseUrl);
    const impl = options.WebSocket ?? resolveGlobalWebSocket();
    if (!impl) throw new Error("SessionStream: no WebSocket implementation available");
    this.WebSocketImpl = impl;
    this.minBackoffMs = options.minBackoffMs ?? BACKOFF_MIN_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? BACKOFF_MAX_MS;
    this.random = options.random ?? Math.random;
    this.queueLimit = options.queueLimit ?? QUEUE_LIMIT;
    this.connect();
  }

  get state(): StreamState {
    return this.currentState;
  }

  get stats(): StreamStats {
    return {
      state: this.currentState,
      droppedIncoming: this.droppedIncomingCount,
      droppedOutgoing: this.droppedOutgoingCount,
      queued: this.queue.length,
      reconnects: this.reconnectCount,
    };
  }

  /** Subscribe to one server message type. Returns the unsubscribe function. */
  on<T extends ServerMessageType>(type: T, handler: StreamHandler<T>): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    // Safe: dispatch() only calls the handlers registered under message.type.
    const erased = handler as AnyHandler;
    set.add(erased);
    return () => {
      set.delete(erased);
    };
  }

  /** Listen for state changes. Returns the unsubscribe function. */
  onState(listener: (state: StreamState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Validates and sends a `ClientMessage`. While the socket is not open, the message is queued
   * (bounded; the oldest is dropped) and flushed after the next `hello`. Throws a ZodError on an
   * invalid message and an Error after `close()`.
   */
  send(message: ClientMessage): void {
    if (this.closedByCaller) throw new Error("SessionStream: send after close()");
    const data = JSON.stringify(ClientMessage.parse(message));
    if (this.currentState === "open" && this.socket?.readyState === WS_OPEN) {
      this.socket.send(data);
      return;
    }
    if (this.queue.length >= this.queueLimit) {
      this.queue.shift();
      this.droppedOutgoingCount += 1;
    }
    this.queue.push(data);
  }

  /** Closes the socket for good; no reconnect follows. */
  close(): void {
    if (this.closedByCaller) return;
    this.closedByCaller = true;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      detach(socket);
      try {
        socket.close(1000, "client closed");
      } catch {
        // Already closed by the other side; nothing to do.
      }
    }
    this.queue.length = 0;
    this.setState("closed");
  }

  private connect(): void {
    if (this.closedByCaller) return;
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    let socket: WebSocketLike;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.handleOpen(socket);
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => this.handleClose(socket);
    socket.onerror = () => {
      // The browser follows every error with a close event, which drives the reconnect.
    };
  }

  private handleOpen(socket: WebSocketLike): void {
    if (this.socket !== socket || this.closedByCaller) return;
    this.attempt = 0;
    this.setState("open");
    const hello: ClientMessage = {
      type: "hello",
      protocol: PROTOCOL_VERSION,
      sessionId: this.sessionId,
    };
    socket.send(JSON.stringify(ClientMessage.parse(hello)));
    while (this.queue.length > 0 && this.socket === socket && this.currentState === "open") {
      const next = this.queue.shift();
      if (next !== undefined) socket.send(next);
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") {
      this.droppedIncomingCount += 1;
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      this.droppedIncomingCount += 1;
      return;
    }
    const parsed = ServerMessage.safeParse(raw);
    if (!parsed.success) {
      this.droppedIncomingCount += 1;
      return;
    }
    this.dispatch(parsed.data);
  }

  private dispatch(message: ServerMessage): void {
    const set = this.handlers.get(message.type);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(message);
      } catch (error) {
        console.error("SessionStream handler failed", message.type, error);
      }
    }
  }

  private handleClose(socket: WebSocketLike): void {
    if (this.socket !== socket) return;
    detach(socket);
    this.socket = null;
    if (this.closedByCaller) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closedByCaller || this.reconnectTimer !== null) return;
    const delay = backoffDelayMs(this.attempt, this.random, this.minBackoffMs, this.maxBackoffMs);
    this.attempt += 1;
    this.reconnectCount += 1;
    this.setState("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(next: StreamState): void {
    if (this.currentState === next) return;
    this.currentState = next;
    for (const listener of Array.from(this.stateListeners)) {
      try {
        listener(next);
      } catch (error) {
        console.error("SessionStream state listener failed", next, error);
      }
    }
  }
}

function detach(socket: WebSocketLike): void {
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
}

function resolveGlobalWebSocket(): WebSocketConstructor | undefined {
  const candidate: unknown = (globalThis as { WebSocket?: unknown }).WebSocket;
  return typeof candidate === "function" ? (candidate as WebSocketConstructor) : undefined;
}

/** Opens the stream for a session and starts connecting immediately. */
export function openSessionStream(options: SessionStreamOptions): SessionStream {
  return new SessionStream(options);
}
