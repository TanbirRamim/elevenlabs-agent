"use client";

import { useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VoiceAccess } from "./access";
import { type Coalescer, createCoalescer } from "./coalesce";
import {
  type ControlPrefix,
  formatControl,
  formatScreenUpdate,
  isControlMessage,
} from "./protocol";

export type VoiceAgent = "interviewer" | "tutor";
export type VoiceStatus = "disconnected" | "connecting" | "connected" | "error";

export interface VoiceLine {
  id: string;
  role: "user" | "agent";
  text: string;
  /** Milliseconds since the session started. */
  tMs: number;
}

export interface UseVoiceOptions {
  agent: VoiceAgent;
  /** Substituted into the agent prompts, e.g. { expert_name: "Maya" }. */
  dynamicVariables?: Record<string, string | number | boolean>;
  /** Session clock. Defaults to time since `start()` succeeded. */
  clock?: () => number;
  /**
   * Off the record or paused: the agent hears nothing (microphone muted to it) and says nothing
   * (its output volume is 0). Back to normal when false.
   */
  hold?: boolean;
  /** The expert's own microphone toggle; muted to the agent while true. */
  micMuted?: boolean;
  /**
   * The call ended without `stop()`: the agent hung up (`end_call`) or the connection failed.
   * Never fires for the caller's own `stop()`, and the hook never reconnects by itself.
   */
  onEnded?: (reason: VoiceEndReason, message: string | null) => void;
}

export type VoiceEndReason = "agent" | "error";

export interface Voice {
  status: VoiceStatus;
  /** Human-readable reason when status is "error". */
  error: string | null;
  mode: "speaking" | "listening";
  agentSpeaking: boolean;
  /** Visible lines only; control messages and screen context are filtered out. */
  transcript: VoiceLine[];
  /** Time of the last user speech signal (final transcript or voice activity), session-relative. */
  lastUserSpeechMs: number | null;
  start(): Promise<void>;
  stop(): void;
  /**
   * Hidden instruction to the agent, e.g. sendControl("[ASK]", "Why Security on T4?"). Triggers a
   * reply. Returns false (and sends nothing) when no voice session is connected.
   */
  sendControl(prefix: ControlPrefix, payload: string | object): boolean;
  /**
   * Background context sent immediately with `sendContextualUpdate` (e.g. the Work Map). Never
   * triggers a reply. Returns false (and sends nothing) when no voice session is connected.
   */
  sendContext(text: string): boolean;
  /** Screen context; coalesced to one update per 2 s, newest wins. Never triggers a reply. Dropped while disconnected. */
  sendScreen(summary: string, tMs?: number): void;
  /** Tell the agent the user is busy (typing/clicking) so it holds its turn. No-op while disconnected. */
  markActivity(): void;
  /** Subscribe to user speech signals for the Turn Gate. Returns an unsubscribe. */
  onUserSpeech(cb: (tMs: number) => void): () => void;
}

const SCREEN_COALESCE_MS = 2000;
/** VAD score (0..1) above which we treat the user as speaking. */
const VAD_SPEECH_THRESHOLD = 0.5;

export function useVoice({
  agent,
  dynamicVariables,
  clock,
  hold = false,
  micMuted = false,
  onEnded,
}: UseVoiceOptions): Voice {
  const startedAt = useRef<number | null>(null);
  const now = useCallback(() => {
    if (clock) return clock();
    return startedAt.current === null ? 0 : Date.now() - startedAt.current;
  }, [clock]);

  const [transcript, setTranscript] = useState<VoiceLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUserSpeechMs, setLastUserSpeechMs] = useState<number | null>(null);
  const speechListeners = useRef(new Set<(tMs: number) => void>());
  const lineSeq = useRef(0);
  /** Bumped by every start() and stop(); an older start() that resolves late does nothing. */
  const generation = useRef(0);
  /** True from stop() until the next start(): the disconnect that follows is ours, not news. */
  const stoppedByUs = useRef(true);
  /** The current session reached "connected"; a failed start is an error, not an ended call. */
  const wasConnected = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const noteUserSpeech = useCallback(() => {
    const t = now();
    setLastUserSpeechMs(t);
    for (const cb of speechListeners.current) cb(t);
  }, [now]);

  const conversation = useConversation({
    // The SDK applies these to the live conversation whenever one exists (setMicMuted, setVolume).
    micMuted: hold || micMuted,
    volume: hold ? 0 : 1,
    onConnect: () => {
      wasConnected.current = true;
    },
    onDisconnect: (details) => {
      if (details.reason === "user" || stoppedByUs.current) return;
      stoppedByUs.current = true;
      if (!wasConnected.current) {
        if (details.reason === "error") setError(details.message);
        return;
      }
      generation.current += 1;
      onEndedRef.current?.(
        details.reason === "agent" ? "agent" : "error",
        details.reason === "error" ? details.message : null,
      );
    },
    onMessage: ({ message, role }) => {
      if (role === "user") noteUserSpeech();
      if (isControlMessage(message)) return;
      lineSeq.current += 1;
      setTranscript((lines) => [
        ...lines,
        { id: `l${lineSeq.current}`, role, text: message, tMs: now() },
      ]);
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore >= VAD_SPEECH_THRESHOLD) noteUserSpeech();
    },
    onError: (message) => setError(message),
  });

  const {
    status,
    mode,
    isSpeaking,
    startSession,
    endSession,
    sendUserMessage,
    sendContextualUpdate,
    sendUserActivity,
  } = conversation;

  // The SDK throws if anything is sent without an active session (e.g. the expert clicks a
  // ticket before pressing Start). Outside a session there is nobody to tell, so drop it.
  const connected = useRef(false);
  connected.current = status === "connected";

  const screen = useRef<Coalescer<string> | null>(null);
  useEffect(() => {
    screen.current = createCoalescer<string>(SCREEN_COALESCE_MS, (text) => {
      if (connected.current) sendContextualUpdate(text);
    });
    return () => screen.current?.dispose();
  }, [sendContextualUpdate]);

  const start = useCallback(async () => {
    generation.current += 1;
    const mine = generation.current;
    stoppedByUs.current = false;
    wasConnected.current = false;
    setError(null);
    const res = await fetch(`/api/eleven/signed-url?agent=${agent}`, { cache: "no-store" });
    // stop() (or another start()) came in while the URL was loading: starting now would open a
    // session nobody asked for, still listening after the call was ended.
    if (mine !== generation.current) return;
    if (!res.ok) {
      const code = (await res.json().catch(() => ({ code: "unknown" }))) as { code?: string };
      setError(
        code.code === "eleven_not_configured"
          ? "ElevenLabs is not configured on the server (missing agent id)."
          : `Could not get a voice session (${res.status}).`,
      );
      return;
    }
    const access = VoiceAccess.parse(await res.json());
    if (mine !== generation.current) return;
    startedAt.current = Date.now();
    setTranscript([]);
    const variables = dynamicVariables ? { dynamicVariables } : {};
    startSession(
      "signedUrl" in access
        ? { signedUrl: access.signedUrl, connectionType: "websocket", ...variables }
        : { agentId: access.agentId, connectionType: "websocket", ...variables },
    );
  }, [agent, dynamicVariables, startSession]);

  const stop = useCallback(() => {
    generation.current += 1;
    stoppedByUs.current = true;
    screen.current?.flush();
    endSession();
  }, [endSession]);

  // Leaving the page ends the call: no conversation keeps listening after its view is gone.
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;
  useEffect(
    () => () => {
      generation.current += 1;
      stoppedByUs.current = true;
      endSessionRef.current();
    },
    [],
  );

  const sendControl = useCallback(
    (prefix: ControlPrefix, payload: string | object): boolean => {
      if (!connected.current) return false;
      sendUserMessage(formatControl(prefix, payload));
      return true;
    },
    [sendUserMessage],
  );
  const sendContext = useCallback(
    (text: string): boolean => {
      if (!connected.current) return false;
      sendContextualUpdate(text);
      return true;
    },
    [sendContextualUpdate],
  );
  const sendScreen = useCallback(
    (summary: string, tMs?: number) =>
      screen.current?.push(formatScreenUpdate(tMs ?? now(), summary)),
    [now],
  );
  const markActivity = useCallback(() => {
    if (connected.current) sendUserActivity();
  }, [sendUserActivity]);
  const onUserSpeech = useCallback((cb: (tMs: number) => void) => {
    speechListeners.current.add(cb);
    return () => {
      speechListeners.current.delete(cb);
    };
  }, []);

  return useMemo(
    () => ({
      status: status === "error" ? "error" : status,
      error,
      mode,
      agentSpeaking: isSpeaking,
      transcript,
      lastUserSpeechMs,
      start,
      stop,
      sendControl,
      sendContext,
      sendScreen,
      markActivity,
      onUserSpeech,
    }),
    [
      status,
      error,
      mode,
      isSpeaking,
      transcript,
      lastUserSpeechMs,
      start,
      stop,
      sendControl,
      sendContext,
      sendScreen,
      markActivity,
      onUserSpeech,
    ],
  );
}
