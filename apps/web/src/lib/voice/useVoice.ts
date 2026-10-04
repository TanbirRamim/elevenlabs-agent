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
}

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

export function useVoice({ agent, dynamicVariables, clock }: UseVoiceOptions): Voice {
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

  const noteUserSpeech = useCallback(() => {
    const t = now();
    setLastUserSpeechMs(t);
    for (const cb of speechListeners.current) cb(t);
  }, [now]);

  const conversation = useConversation({
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
    setError(null);
    const res = await fetch(`/api/eleven/signed-url?agent=${agent}`, { cache: "no-store" });
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
    screen.current?.flush();
    endSession();
  }, [endSession]);

  const sendControl = useCallback(
    (prefix: ControlPrefix, payload: string | object): boolean => {
      if (!connected.current) return false;
      sendUserMessage(formatControl(prefix, payload));
      return true;
    },
    [sendUserMessage],
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
      sendScreen,
      markActivity,
      onUserSpeech,
    ],
  );
}
