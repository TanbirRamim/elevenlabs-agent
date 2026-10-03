"use client";

import type {
  CandidateQuestion,
  DeskEvent,
  GuardVerdict,
  PendingAction,
  PublicTicket,
} from "@shadow/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeskSim } from "@/components/desk/DeskSim";
import { DESK_ROOT_ID, PII_ATTR } from "@/components/desk/types";
import { describeDeskEvent, detectRecordPhrase } from "@/components/session/helpers";
import { SidePanel } from "@/components/session/SidePanel";
import { ApiClientError, createSession, getTickets, preSave, uploadRecording } from "@/lib/api";
import {
  captureFrame,
  type FrameLoop,
  pickScreen,
  piiRects,
  type Recorder,
  scaleRect,
  startFrameLoop,
  startRecorder,
  videoToViewportScale,
} from "@/lib/capture";
import { useTurnGate } from "@/lib/gate/useTurnGate";
import { openSessionStream, type SessionStream } from "@/lib/stream";
import { DEFAULT_GATE } from "@/lib/turnGate";
import { useVoice } from "@/lib/voice";

const FRAME_INTERVAL_MS = 1500;
const HAMMING_THRESHOLD = 6;

type Phase = "loading" | "ready" | "capturing" | "ended" | "failed";

/**
 * Module 1, Capture. Hosts DeskSim, the voice side panel, screen capture, the Turn Gate
 * and off-the-record. Specs: docs/tasks/tanbir.md TAN-2, TAN-3, TAN-4, TAN-5.
 */
export function CaptureSession() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [problem, setProblem] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [offRecord, setOffRecord] = useState(false);
  const [candidate, setCandidate] = useState<CandidateQuestion | null>(null);
  const [lastInputActivityMs, setLastInputActivityMs] = useState<number | null>(null);
  const [lastScreenChangeMs, setLastScreenChangeMs] = useState<number | null>(null);

  const startedAt = useRef<number | null>(null);
  const clock = useCallback(
    () => (startedAt.current === null ? 0 : Date.now() - startedAt.current),
    [],
  );

  const stream = useRef<SessionStream | null>(null);
  const loop = useRef<FrameLoop | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const media = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const offRecordRef = useRef(false);
  const endRef = useRef<() => Promise<void>>(async () => {});

  const voice = useVoice({
    agent: "interviewer",
    dynamicVariables: { expert_name: "Maya" },
    clock,
  });

  // Load the expert's tickets and create the session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ tickets: list }, session] = await Promise.all([
          getTickets("expert"),
          createSession({ mode: "capture" }),
        ]);
        if (cancelled) return;
        setTickets(list);
        setSessionId(session.id);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setProblem(describeError(err));
        setPhase("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Session stream: candidates from the Curiosity Engine, vision events for the agent's context.
  useEffect(() => {
    if (!sessionId) return;
    const s = openSessionStream({ sessionId });
    stream.current = s;
    const offs = [
      s.on("candidate_question", (m) => setCandidate(m.question)),
      s.on("screen_event", (m) => {
        // DOM events are already sent to the agent locally; only vision adds new information.
        if (m.event.source === "vision" && !offRecordRef.current)
          voice.sendScreen(m.event.summary, m.event.tMs);
      }),
    ];
    return () => {
      for (const off of offs) off();
      s.close();
      stream.current = null;
    };
  }, [sessionId, voice.sendScreen]);

  const setRecord = useCallback(
    (off: boolean) => {
      if (offRecordRef.current === off) return;
      offRecordRef.current = off;
      setOffRecord(off);
      stream.current?.send({ type: "off_record", on: off, tMs: clock() });
      if (off) {
        loop.current?.pause();
        recorder.current?.pause();
      } else {
        loop.current?.resume();
        recorder.current?.resume();
      }
    },
    [clock],
  );

  // Alt+O toggles off the record.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyO") {
        e.preventDefault();
        setRecord(!offRecordRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setRecord]);

  // Forward new transcript lines to the API and react to spoken record commands.
  const sentLines = useRef(0);
  useEffect(() => {
    const lines = voice.transcript;
    for (let i = sentLines.current; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.role === "user") {
        const phrase = detectRecordPhrase(line.text);
        if (phrase) {
          setRecord(phrase === "off");
          continue; // the command itself is not content
        }
      }
      if (offRecordRef.current) continue; // nothing said off the record leaves the browser
      stream.current?.send({
        type: "transcript",
        segmentId: line.id,
        tStartMs: line.tMs,
        tEndMs: line.tMs,
        speaker: line.role === "user" ? "expert" : "agent",
        text: line.text,
      });
    }
    sentLines.current = lines.length;
  }, [voice.transcript, setRecord]);

  const onDeskEvent = useCallback(
    (event: DeskEvent) => {
      if (offRecordRef.current) return;
      stream.current?.send({ type: "desk_event", event });
      if (event.type === "input_activity") {
        setLastInputActivityMs(event.tMs);
        voice.markActivity();
        return;
      }
      const summary = describeDeskEvent(event);
      if (summary) voice.sendScreen(summary, event.tMs);
    },
    [voice.markActivity, voice.sendScreen],
  );

  // Capture mode never blocks: the verdict is logged for the map, the expert's action always goes through.
  const onPreSave = useCallback(async (action: PendingAction): Promise<GuardVerdict> => {
    try {
      const verdict = await preSave(action);
      return { ...verdict, decision: "ALLOW" };
    } catch {
      return { decision: "ALLOW", ruleIds: [], source: "timeout_allow" };
    }
  }, []);

  const gate = useTurnGate({
    enabled: phase === "capturing" && voice.status === "connected",
    clock,
    lastUserSpeechMs: voice.lastUserSpeechMs,
    lastInputActivityMs,
    lastScreenChangeMs,
    agentSpeaking: voice.agentSpeaking,
    offRecord,
    candidate,
    onOpen: (q, asked) => {
      voice.sendControl("[ASK]", q.text);
      stream.current?.send({ type: "question_asked", questionId: q.id, tMs: asked.atMs });
      setCandidate(null);
    },
  });

  const start = useCallback(async () => {
    setProblem(null);
    try {
      const screen = await pickScreen({ preferCurrentTab: true, frameRate: 5 });
      media.current = screen;
      const v = video.current;
      if (!v) throw new Error("video element missing");
      v.srcObject = screen;
      await v.play();
      startedAt.current = Date.now();
      recorder.current = startRecorder(screen);
      loop.current = startFrameLoop({
        intervalMs: FRAME_INTERVAL_MS,
        hammingThreshold: HAMMING_THRESHOLD,
        clock,
        capture: () => {
          const root = document.getElementById(DESK_ROOT_ID);
          const scale = videoToViewportScale(v);
          if (!root || !scale) return null;
          const box = root.getBoundingClientRect();
          return captureFrame(v, {
            cropToRect: scaleRect({ x: box.x, y: box.y, w: box.width, h: box.height }, scale),
            blackout: piiRects(root, `[${PII_ATTR}]`).map((r) => scaleRect(r, scale)),
            maxWidth: 1280,
            quality: 0.7,
          });
        },
        onScreenChange: (tMs) => setLastScreenChangeMs(tMs),
        onFrame: (f) =>
          stream.current?.send({
            type: "frame",
            tMs: f.tMs,
            frameId: f.frameId,
            jpegBase64: f.jpegBase64,
            phash: f.phash,
          }),
      });
      screen.getVideoTracks()[0]?.addEventListener("ended", () => void endRef.current());
      await voice.start();
      setPhase("capturing");
    } catch (err) {
      setProblem(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Screen sharing was not allowed. Choose this tab when the browser asks."
          : describeError(err),
      );
    }
  }, [clock, voice.start]);

  const end = useCallback(async () => {
    loop.current?.stop();
    loop.current = null;
    voice.stop();
    for (const track of media.current?.getTracks() ?? []) track.stop();
    setPhase("ended");
    const rec = recorder.current;
    recorder.current = null;
    if (rec && sessionId) {
      try {
        await uploadRecording(sessionId, await rec.stop());
      } catch (err) {
        setProblem(`The recording could not be uploaded: ${describeError(err)}`);
      }
    }
  }, [sessionId, voice.stop]);
  endRef.current = end;

  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {phase === "ready" && (
            <button
              type="button"
              onClick={() => void start()}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Share this tab and start
            </button>
          )}
          {phase === "capturing" && (
            <button
              type="button"
              onClick={() => void end()}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
            >
              End task
            </button>
          )}
          {phase === "ended" && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Task ended. The debrief comes next.
            </p>
          )}
          {phase === "loading" && <p className="text-sm text-neutral-500">Loading tickets…</p>}
          {gate.asked.length > 0 && (
            <p className="text-xs text-neutral-500">
              Gate: {gate.decision.open ? "open" : gate.decision.reason.replaceAll("_", " ")}
            </p>
          )}
        </div>
        {problem && (
          <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {problem}
          </p>
        )}
        {phase !== "failed" && phase !== "loading" && (
          <DeskSim
            tickets={tickets}
            mode="capture"
            clock={clock}
            onDeskEvent={onDeskEvent}
            preSave={onPreSave}
          />
        )}
        {/* Hidden: the shared-tab stream feeds the frame loop and never renders. */}
        <video ref={video} muted playsInline className="hidden" />
      </section>
      <SidePanel
        status={voice.status}
        mode={voice.mode}
        offRecord={offRecord}
        questionsAsked={gate.asked.length}
        questionBudget={DEFAULT_GATE.maxPer10Min}
        transcript={voice.transcript}
        error={voice.error}
        onToggleOffRecord={() => setRecord(!offRecordRef.current)}
      />
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.kind === "network")
      return "The Shadow API is not reachable. Is it running (pnpm api:public or pnpm dev)?";
    return `The Shadow API returned an error (${err.status ?? "?"}${err.code ? `, ${err.code}` : ""}).`;
  }
  return err instanceof Error ? err.message : String(err);
}
