"use client";

import type {
  CandidateQuestion,
  DeskEvent,
  GuardVerdict,
  PendingAction,
  PublicTicket,
} from "@shadow/schema";
import { MicOff, ScreenShare, Square } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DebriefPanel } from "@/components/debrief/DebriefPanel";
import type { DebriefVoice } from "@/components/debrief/useDebrief";
import { DeskSim } from "@/components/desk/DeskSim";
import { DESK_ROOT_ID, PII_ATTR } from "@/components/desk/types";
import { describeDeskEvent, detectRecordPhrase } from "@/components/session/helpers";
import { Notice } from "@/components/session/Notice";
import { SidePanel } from "@/components/session/SidePanel";
import { Button, cx, KeyboardKey } from "@/components/ui";
import { ApiClientError, createSession, getTickets, preSave, uploadRecording } from "@/lib/api";
import {
  captureFrame,
  type FrameLoop,
  pickScreen,
  piiRects,
  type Recorder,
  type RedactedRegion,
  type RedactedStream,
  scaleRect,
  startFrameLoop,
  startRecorder,
  startRedactedStream,
  videoToViewportScale,
} from "@/lib/capture";
import { useTurnGate } from "@/lib/gate/useTurnGate";
import { openSessionStream, type SessionStream } from "@/lib/stream";
import { DEFAULT_GATE } from "@/lib/turnGate";
import { useVoice } from "@/lib/voice";

const FRAME_INTERVAL_MS = 1500;
const HAMMING_THRESHOLD = 6;

type Phase = "loading" | "ready" | "capturing" | "ended" | "debrief" | "failed";

/**
 * Module 1, Capture. Hosts DeskSim, the voice side panel, screen capture, the Turn Gate
 * and off-the-record, then hands over to the debrief after End task.
 * Specs: docs/tasks/tanbir.md TAN-2, TAN-3, TAN-4, TAN-5, TAN-7, TAN-8.
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
  const redacted = useRef<RedactedStream | null>(null);
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
  /** Segment ids the API has received; the debrief may only cite these. */
  const sentIds = useRef(new Set<string>());
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
      sentIds.current.add(line.id);
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
      // One region for frames and recording: DeskSim only, PII blacked out.
      const region = (): RedactedRegion | null => {
        const root = document.getElementById(DESK_ROOT_ID);
        const scale = videoToViewportScale(v);
        if (!root || !scale) return null;
        const box = root.getBoundingClientRect();
        return {
          crop: scaleRect({ x: box.x, y: box.y, w: box.width, h: box.height }, scale),
          blackout: piiRects(root, `[${PII_ATTR}]`).map((r) => scaleRect(r, scale)),
        };
      };
      // The raw tab is never recorded; only the redacted canvas is.
      redacted.current = startRedactedStream(v, { width: 1280, height: 720, getRegion: region });
      recorder.current = redacted.current ? startRecorder(redacted.current.stream) : null;
      loop.current = startFrameLoop({
        intervalMs: FRAME_INTERVAL_MS,
        hammingThreshold: HAMMING_THRESHOLD,
        clock,
        capture: () => {
          const r = region();
          return r
            ? captureFrame(v, {
                cropToRect: r.crop,
                blackout: r.blackout,
                maxWidth: 1280,
                quality: 0.7,
              })
            : null;
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
    // The voice session stays open: Shadow runs the debrief in the same conversation.
    for (const track of media.current?.getTracks() ?? []) track.stop();
    setPhase("ended");
    const rec = recorder.current;
    recorder.current = null;
    if (rec && sessionId) {
      try {
        const blob = await rec.stop();
        redacted.current?.stop();
        redacted.current = null;
        await uploadRecording(sessionId, blob);
      } catch (err) {
        setProblem(`The recording could not be uploaded: ${describeError(err)}`);
      }
    }
    // Idempotent: also covers "no recorder" and "no session" paths.
    redacted.current?.stop();
    redacted.current = null;
    setPhase("debrief");
  }, [sessionId]);
  endRef.current = end;

  const typedSeq = useRef(0);
  const sendTypedLine = useCallback(
    (text: string): string | null => {
      const s = stream.current;
      if (!s || offRecordRef.current) return null;
      typedSeq.current += 1;
      const segmentId = `typed${typedSeq.current}`;
      const tMs = Math.max(0, Math.round(clock()));
      try {
        s.send({
          type: "transcript",
          segmentId,
          tStartMs: tMs,
          tEndMs: tMs,
          speaker: "expert",
          text,
        });
      } catch {
        return null;
      }
      sentIds.current.add(segmentId);
      return segmentId;
    },
    [clock],
  );
  const isSent = useCallback((id: string) => sentIds.current.has(id), []);

  const voiceConnected = voice.status === "connected";
  const debriefVoice = useMemo<DebriefVoice>(
    () => ({
      connected: voiceConnected,
      transcript: voice.transcript,
      speak: (prefix, payload) => {
        if (!voiceConnected) return false;
        try {
          voice.sendControl(prefix, payload);
          return true;
        } catch {
          return false;
        }
      },
    }),
    [voiceConnected, voice.transcript, voice.sendControl],
  );
  const onDebriefFinished = useCallback(() => voice.stop(), [voice.stop]);

  return (
    <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-6">
      <section aria-label="Workspace" className="flex min-w-0 flex-col gap-4 lg:col-span-8">
        <PhaseHeader phase={phase}>
          {phase === "ready" && (
            <Button onClick={() => void start()}>
              <ScreenShare aria-hidden="true" />
              Share this tab and start
            </Button>
          )}
          {phase === "capturing" && (
            <Button onClick={() => void end()}>
              <Square aria-hidden="true" />
              End task
            </Button>
          )}
          {phase === "ended" && (
            <p aria-live="polite" className="text-[0.9375rem] text-ink-muted">
              Task ended. Saving the recording before the debrief…
            </p>
          )}
          {phase === "loading" && (
            <p aria-live="polite" className="text-[0.9375rem] text-ink-muted">
              Loading tickets…
            </p>
          )}
        </PhaseHeader>

        {gate.asked.length > 0 && (
          <p className="font-mono text-xs text-ink-faint">
            Gate: {gate.decision.open ? "open" : gate.decision.reason.replaceAll("_", " ")}
          </p>
        )}
        {problem && <Notice>{problem}</Notice>}

        {offRecord && phase !== "debrief" && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-ink px-4 py-3 text-canvas"
          >
            <MicOff aria-hidden="true" className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
              <span className="font-medium">You are off the record.</span> Nothing you do or say is
              captured for the Work Map until you resume.
            </p>
            <span className="inline-flex items-center gap-1 text-sm">
              <KeyboardKey>Alt</KeyboardKey>
              <span aria-hidden="true">+</span>
              <KeyboardKey>O</KeyboardKey>
              <span className="ml-1 opacity-80">to resume</span>
            </span>
          </div>
        )}

        {phase === "debrief" && sessionId && (
          <DebriefPanel
            sessionId={sessionId}
            voice={debriefVoice}
            clock={clock}
            isSent={isSent}
            sendTypedLine={sendTypedLine}
            onFinished={onDebriefFinished}
          />
        )}
        {(phase === "ready" || phase === "capturing" || phase === "ended") && (
          // DeskSim keeps its own look. The frame only marks the captured region and, off the
          // record, turns dashed so the paused state reads on the desk itself too.
          <div
            className={cx(
              "overflow-x-auto rounded-panel border p-2 transition-colors duration-300",
              offRecord ? "border-dashed border-ink-faint" : "border-rule bg-sunken",
            )}
          >
            <div className="min-w-[42rem]">
              <DeskSim
                tickets={tickets}
                mode="capture"
                clock={clock}
                onDeskEvent={onDeskEvent}
                preSave={onPreSave}
              />
            </div>
          </div>
        )}
        {/* Hidden: the shared-tab stream feeds the frame loop and never renders. */}
        <video ref={video} muted playsInline className="hidden" />
      </section>
      <div className="min-w-0 lg:col-span-4">
        <SidePanel
          status={voice.status}
          mode={voice.mode}
          agentSpeaking={voice.agentSpeaking}
          offRecord={offRecord}
          questionsAsked={gate.asked.length}
          questionBudget={DEFAULT_GATE.maxPer10Min}
          transcript={voice.transcript}
          error={voice.error}
          onToggleOffRecord={() => setRecord(!offRecordRef.current)}
        />
      </div>
    </div>
  );
}

const PHASE_STEPS = [
  { key: "ready", label: "Ready" },
  { key: "capturing", label: "Capturing" },
  { key: "ended", label: "Saving" },
  { key: "debrief", label: "Debrief" },
] as const satisfies readonly { key: Phase; label: string }[];

/** Where the session is, as the real sequence it is, with the one action that moves it on. */
function PhaseHeader({ phase, children }: { phase: Phase; children: ReactNode }) {
  const current = PHASE_STEPS.findIndex((s) => s.key === phase);
  return (
    <div className="flex flex-col gap-4 border-y border-rule py-4 sm:flex-row sm:items-center sm:justify-between">
      <ol aria-label="Session phase" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {PHASE_STEPS.map((step, i) => {
          const isCurrent = i === current;
          const isDone = current > i;
          return (
            <li
              key={step.key}
              aria-current={isCurrent ? "step" : undefined}
              className={cx(
                "inline-flex items-baseline gap-1.5 text-[0.9375rem]",
                isCurrent ? "text-ink" : isDone ? "text-ink-muted" : "text-ink-faint",
              )}
            >
              <span className="font-mono text-xs tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={cx(
                  isCurrent &&
                    "font-medium underline decoration-1 underline-offset-[6px] decoration-ink",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex min-h-11 items-center">{children}</div>
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
