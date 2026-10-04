"use client";

import { useConversationInput } from "@elevenlabs/react";
import type {
  CandidateQuestion,
  DeskEvent,
  GuardVerdict,
  PendingAction,
  PublicTicket,
} from "@shadow/schema";
import { EyeOff, Mic, Pause, Play, RotateCw, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DebriefPanel } from "@/components/debrief/DebriefPanel";
import type { DebriefVoice } from "@/components/debrief/useDebrief";
import { DeskSim } from "@/components/desk/DeskSim";
import { DESK_ROOT_ID, PII_ATTR } from "@/components/desk/types";
import type { InsightNumbers } from "@/components/insight/InsightPanel";
import {
  Countdown,
  formatElapsed,
  type ProcessingStep,
  ProcessingSteps,
  type RecordingState,
} from "@/components/recording";
import {
  detectRecordPhrase,
  listeningStateFor,
  questionsInWindow,
} from "@/components/session/helpers";
import { LiveRecordingStatus } from "@/components/session/LiveRecording";
import { Alert, Button, Dialog, KbdCombo } from "@/components/ui";
import { publicEnv } from "@/env";
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
import { openSessionStream, QUEUE_LIMIT, type SessionStream, type StreamState } from "@/lib/stream";
import { DEFAULT_GATE } from "@/lib/turnGate";
import { useVoice } from "@/lib/voice";
import { CapturePill } from "./CapturePill";
import {
  buildPreflight,
  HoldStrip,
  LoadingWorkspace,
  type ScreenState,
  ShareEndedNotice,
  START_BUTTON_ID,
} from "./parts";
import { usePreflight } from "./usePreflight";

const FRAME_INTERVAL_MS = 1500;
const HAMMING_THRESHOLD = 6;
/** How long Shadow's latest question stays pinned at the top of the rail. */
const QUESTION_CALLOUT_MS = 30_000;

type Phase = "loading" | "ready" | "countdown" | "capturing" | "processing" | "debrief" | "failed";

type LoadError = { offline: boolean; message: string };
type EndReason = "stopped" | "share_ended";

const SURFACE: Record<string, string> = {
  browser: "Sharing a browser tab",
  window: "Sharing a window. Only the desk area is cropped, redacted and kept.",
  monitor: "Sharing a whole screen. Only the desk area is cropped, redacted and kept.",
};

const INITIAL_STEPS: ProcessingStep[] = [
  { id: "recording", label: "Finish the recording", status: "running" },
  { id: "redaction", label: "Redact personal data", status: "waiting" },
  { id: "upload", label: "Upload the redacted video", status: "waiting" },
];

/**
 * Module 1, Capture. Preflight, countdown, the recording workspace (DeskSim, the Shadow rail,
 * the Turn Gate and its live timeline, off the record, pause) and the debrief after Stop.
 * Specs: docs/tasks/tanbir.md TAN-2, TAN-3, TAN-4, TAN-5, TAN-7, TAN-8.
 */
export function CaptureSession() {
  const router = useRouter();
  const [phase, setPhaseState] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const [loadKey, setLoadKey] = useState(0);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [screen, setScreen] = useState<ScreenState>({ kind: "idle" });
  const [offRecord, setOffRecord] = useState(false);
  const [paused, setPaused] = useState(false);
  const [candidate, setCandidate] = useState<CandidateQuestion | null>(null);
  const [insight, setInsight] = useState<InsightNumbers | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [lastInputActivityMs, setLastInputActivityMs] = useState<number | null>(null);
  const [lastScreenChangeMs, setLastScreenChangeMs] = useState<number | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [steps, setSteps] = useState<ProcessingStep[]>(INITIAL_STEPS);
  const [endReason, setEndReason] = useState<EndReason | null>(null);
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);
  const [intentPending, setIntentPending] = useState(false);

  const startedAt = useRef<number | null>(null);
  const clock = useCallback(
    () => (startedAt.current === null ? 0 : Date.now() - startedAt.current),
    [],
  );
  // Recorded time: session time minus pauses, frozen at Stop.
  const pausedAt = useRef<number | null>(null);
  const pausedTotal = useRef(0);
  const frozen = useRef<number | null>(null);
  const elapsed = useCallback(() => {
    if (frozen.current !== null) return frozen.current;
    if (startedAt.current === null) return 0;
    const now = Date.now();
    const pausing = pausedAt.current === null ? 0 : now - pausedAt.current;
    return Math.max(0, now - startedAt.current - pausedTotal.current - pausing);
  }, []);

  const stream = useRef<SessionStream | null>(null);
  const loop = useRef<FrameLoop | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const redacted = useRef<RedactedStream | null>(null);
  const media = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const offRecordRef = useRef(false);
  const pausedRef = useRef(false);
  const endRef = useRef<(reason: EndReason) => Promise<void>>(async () => {});
  const shareEndedRef = useRef<() => void>(() => {});
  /** Nothing leaves the browser while this is true. */
  const holding = useCallback(() => offRecordRef.current || pausedRef.current, []);

  const voice = useVoice({
    agent: "interviewer",
    dynamicVariables: { expert_name: "Maya" },
    clock,
  });
  const { setMuted } = useConversationInput();
  const preflight = usePreflight({ deskReady: phase !== "loading" && phase !== "failed" });

  // Load the expert's tickets and create the session.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loadKey` re-runs the load on "Try again"
  useEffect(() => {
    let cancelled = false;
    go("loading");
    setLoadError(null);
    (async () => {
      try {
        const [{ tickets: list }, session] = await Promise.all([
          getTickets("expert"),
          createSession({ mode: "capture" }),
        ]);
        if (cancelled) return;
        setTickets(list);
        setSessionId(session.id);
        go("ready");
      } catch (err) {
        if (cancelled) return;
        setLoadError({
          offline: err instanceof ApiClientError && err.kind === "network",
          message: describeError(err),
        });
        go("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [go, loadKey]);

  // Session stream: candidates from the Curiosity Engine, vision events for the agent's context.
  useEffect(() => {
    if (!sessionId) return;
    const s = openSessionStream({ sessionId });
    stream.current = s;
    setStreamState(s.state);
    const offs = [
      s.onState(setStreamState),
      s.on("candidate_question", (m) => setCandidate(m.question)),
      s.on("insight", ({ type: _type, ...numbers }) => setInsight(numbers)),
      s.on("screen_event", (m) => {
        // Vision-first: the agent learns the screen from what the API saw in the frames (DOM
        // events arrive here only when the API runs with CAPTURE_SIGNALS=vision+desk).
        if (!offRecordRef.current && !pausedRef.current)
          voice.sendScreen(m.event.summary, m.event.tMs);
      }),
    ];
    return () => {
      for (const off of offs) off();
      s.close();
      stream.current = null;
    };
  }, [sessionId, voice.sendScreen]);

  /** Frames and video run only while on the record and not paused. */
  const applyCapture = useCallback(() => {
    if (holding()) {
      loop.current?.pause();
      recorder.current?.pause();
    } else {
      loop.current?.resume();
      recorder.current?.resume();
    }
  }, [holding]);

  const setRecord = useCallback(
    (off: boolean) => {
      if (offRecordRef.current === off) return;
      offRecordRef.current = off;
      setOffRecord(off);
      stream.current?.send({ type: "off_record", on: off, tMs: clock() });
      applyCapture();
    },
    [clock, applyCapture],
  );

  const setPause = useCallback(
    (on: boolean) => {
      if (pausedRef.current === on || phaseRef.current !== "capturing") return;
      if (on && offRecordRef.current) return; // off the record already captures nothing
      pausedRef.current = on;
      if (on) pausedAt.current = Date.now();
      else if (pausedAt.current !== null) {
        pausedTotal.current += Date.now() - pausedAt.current;
        pausedAt.current = null;
      }
      setPaused(on);
      applyCapture();
    },
    [applyCapture],
  );

  // Paused — or the pill's mic toggle — mutes the microphone for the voice agent.
  useEffect(() => {
    if (voice.status !== "connected") return;
    try {
      setMuted(paused || micMuted);
    } catch {
      // No live conversation to mute; nothing is being heard.
    }
  }, [paused, micMuted, voice.status, setMuted]);

  // Alt+O toggles off the record while recording.
  useEffect(() => {
    if (phase !== "capturing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyO") {
        e.preventDefault();
        setRecord(!offRecordRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, setRecord]);

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
      if (holding()) continue; // nothing said off the record or paused leaves the browser
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
  }, [voice.transcript, setRecord, holding]);

  const onDeskEvent = useCallback(
    (event: DeskEvent) => {
      if (holding()) return;
      // Ground truth for the vision/DOM agreement metric; the screen itself reaches the agent
      // through vision, as it would for any app shared on screen.
      stream.current?.send({ type: "desk_event", event });
      if (event.type === "input_activity") {
        setLastInputActivityMs(event.tMs);
        voice.markActivity();
      }
    },
    [voice.markActivity, holding],
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

  const voiceConnected = voice.status === "connected";
  const gate = useTurnGate({
    enabled: phase === "capturing" && voiceConnected && !paused,
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

  /** Asks for the tab. Needs a user gesture, so it runs from a button. */
  const share = useCallback(async (): Promise<boolean> => {
    if (media.current?.active) return true;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreen({ kind: "error", message: "This browser cannot share a tab." });
      return false;
    }
    setScreen({ kind: "requesting" });
    try {
      const s = await pickScreen({ preferCurrentTab: true, frameRate: 5 });
      const v = video.current;
      if (!v) throw new Error("video element missing");
      v.srcObject = s;
      await v.play();
      media.current = s;
      const track = s.getVideoTracks()[0];
      track?.addEventListener("ended", () => shareEndedRef.current());
      const surface = track?.getSettings().displaySurface;
      setScreen({
        kind: "sharing",
        detail: (surface && SURFACE[surface]) ?? "Sharing the screen you picked",
      });
      return true;
    } catch (err) {
      setScreen(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? { kind: "denied" }
          : { kind: "error", message: describeError(err) },
      );
      return false;
    }
  }, []);

  const requestStart = useCallback(async () => {
    setProblem(null);
    setIntentPending(false);
    if (await share()) go("countdown");
  }, [share, go]);

  /** After the countdown: frames, the redacted recording and the voice session start. */
  const begin = useCallback(async () => {
    if (phaseRef.current !== "countdown") return;
    const v = video.current;
    const screenStream = media.current;
    if (!v || !screenStream?.active) {
      setScreen({ kind: "ended" });
      go("ready");
      return;
    }
    try {
      startedAt.current = Date.now();
      pausedTotal.current = 0;
      pausedAt.current = null;
      frozen.current = null;
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
      go("capturing");
      await voice.start();
    } catch (err) {
      loop.current?.stop();
      loop.current = null;
      setProblem(describeError(err));
    }
  }, [clock, voice.start, go]);

  const cancelCountdown = useCallback(() => {
    if (phaseRef.current === "countdown") go("ready");
  }, [go]);

  const setStep = useCallback((id: string, patch: Partial<ProcessingStep>) => {
    setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const end = useCallback(
    async (reason: EndReason) => {
      if (phaseRef.current !== "capturing") return;
      frozen.current = elapsed();
      if (pausedRef.current) {
        pausedRef.current = false;
        pausedAt.current = null;
        setPaused(false);
      }
      // The debrief is a conversation the expert takes part in on purpose: it is on the record.
      setRecord(false);
      setEndReason(reason);
      setSteps(INITIAL_STEPS);
      setUploadProblem(null);
      go("processing");
      loop.current?.stop();
      loop.current = null;
      // The voice session stays open: Shadow runs the debrief in the same conversation.
      for (const track of media.current?.getTracks() ?? []) track.stop();
      media.current = null;
      setScreen({ kind: "idle" });
      const rec = recorder.current;
      recorder.current = null;
      if (!rec || !sessionId) {
        const why = "Nothing was recorded: the redacted canvas could not start.";
        setStep("recording", { status: "skipped", detail: why });
        setStep("redaction", { status: "skipped" });
        setStep("upload", { status: "skipped" });
      } else {
        try {
          const blob = await rec.stop();
          redacted.current?.stop();
          redacted.current = null;
          setStep("recording", {
            status: "done",
            detail: `${formatElapsed(frozen.current ?? 0)} recorded, ${(blob.size / 1_000_000).toFixed(1)} MB`,
          });
          setStep("redaction", {
            status: "done",
            detail:
              "Blacked out in this browser while recording. The raw tab was never stored or sent.",
          });
          setStep("upload", { status: "running" });
          await uploadRecording(sessionId, blob);
          setStep("upload", { status: "done", detail: "Stored with the session" });
        } catch (err) {
          const message = describeError(err);
          setUploadProblem(message);
          setSteps((list) =>
            list.map((s) =>
              s.status === "running" || s.status === "waiting"
                ? { ...s, status: s.status === "running" ? "failed" : "skipped", detail: message }
                : s,
            ),
          );
        }
      }
      // Idempotent: also covers "no recorder" and "no session" paths.
      redacted.current?.stop();
      redacted.current = null;
      go("debrief");
    },
    [sessionId, elapsed, setRecord, setStep, go],
  );
  endRef.current = end;

  shareEndedRef.current = () => {
    if (phaseRef.current === "capturing") {
      void endRef.current("share_ended");
      return;
    }
    media.current = null;
    setScreen({ kind: "ended" });
    if (phaseRef.current === "countdown") go("ready");
  };

  // Stop every capture resource if the page goes away mid-session.
  useEffect(
    () => () => {
      loop.current?.stop();
      redacted.current?.stop();
      for (const track of media.current?.getTracks() ?? []) track.stop();
    },
    [],
  );

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

  // ⌘K "Start a capture session" lands here with ?intent=start: point at the preflight.
  const onStartIntent = useCallback(() => {
    setIntentPending(true);
    router.replace("/capture", { scroll: false });
  }, [router]);
  useEffect(() => {
    if (intentPending && phase === "ready") document.getElementById(START_BUTTON_ID)?.focus();
  }, [intentPending, phase]);

  const live = phase === "capturing";
  const recordingState: RecordingState = live
    ? paused
      ? "paused"
      : offRecord
        ? "off-record"
        : "recording"
    : "idle";
  const voiceState = listeningStateFor(
    voice.status,
    voice.mode,
    voice.agentSpeaking,
    offRecord || paused,
  );
  const askedAt = gate.asked.map((q) => q.atMs);
  const nowMs = gate.signals.nowMs;
  const lastAsked = gate.asked.at(-1);
  const current =
    live && lastAsked && nowMs - lastAsked.atMs < QUESTION_CALLOUT_MS
      ? { id: lastAsked.id, text: lastAsked.text, atMs: lastAsked.atMs }
      : null;
  const streamDown =
    sessionId !== null &&
    (phase === "capturing" || phase === "processing" || phase === "debrief") &&
    (streamState === "reconnecting" || streamState === "closed");

  const preflightItems = buildPreflight({
    preflight,
    screen,
    onShare: () => void share(),
  });
  const blocking =
    preflight.redaction.status === "failed" || screen.kind === "requesting" || sessionId === null;
  const voiceMissing = preflight.agent.status === "failed" || preflight.mic.status === "failed";

  const showDesk = phase === "ready" || phase === "countdown" || phase === "capturing";

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <Suspense fallback={null}>
        <StartIntent onStart={onStartIntent} />
      </Suspense>

      {phase === "loading" ? (
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <LoadingWorkspace />
        </div>
      ) : null}

      {phase === "failed" && loadError ? (
        <div className="mx-auto w-full max-w-xl px-4 py-10">
          <Alert
            tone={loadError.offline ? "offline" : "danger"}
            title={
              loadError.offline
                ? "The Shadow API is not reachable"
                : "Could not start a capture session"
            }
            action={
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCw />}
                onClick={() => setLoadKey((k) => k + 1)}
              >
                Try again
              </Button>
            }
          >
            {loadError.offline ? (
              <>
                Tried <code className="font-mono text-xs">{publicEnv.apiUrl}</code>. Start the API
                with <code className="font-mono text-xs">pnpm dev</code>, then try again.
              </>
            ) : (
              loadError.message
            )}
          </Alert>
        </div>
      ) : null}

      {/* The standalone ticketing app: the whole viewport belongs to DeskSim while the
          expert works; Shadow is only the floating dock and its callouts. */}
      {showDesk ? (
        <div className="relative min-h-0 flex-1">
          <DeskSim
            tickets={tickets}
            mode="capture"
            clock={clock}
            onDeskEvent={onDeskEvent}
            preSave={onPreSave}
            chrome="app"
          />

          {live && (offRecord || paused) ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-xl">
                {offRecord ? (
                  <HoldStrip
                    icon={<EyeOff />}
                    title="You are off the record."
                    text="Nothing you do or say is captured until you resume."
                    action={
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Mic />}
                        onClick={() => setRecord(false)}
                        trailing={
                          <span aria-hidden="true" className="hidden sm:inline-flex">
                            <KbdCombo keys={["Alt", "O"]} />
                          </span>
                        }
                      >
                        Back on the record
                      </Button>
                    }
                  />
                ) : (
                  <HoldStrip
                    icon={<Pause />}
                    title="Recording paused."
                    text="Your microphone is muted for Shadow and nothing is captured. The timer is stopped."
                    action={
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Play />}
                        onClick={() => setPause(false)}
                      >
                        Resume
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          ) : null}

          <CapturePill
            stage={live ? "recording" : "start"}
            startPanel={
              live
                ? undefined
                : {
                    onStart: () => void requestStart(),
                    disabled: blocking || phase === "countdown",
                    busy: screen.kind === "requesting",
                    intent: intentPending,
                    voiceMissing,
                    redactionFailed: preflight.redaction.status === "failed",
                    items: preflightItems,
                    onRetry: preflight.recheck,
                  }
            }
            recordingState={recordingState}
            elapsed={elapsed}
            voiceConnected={voiceConnected}
            voiceState={voice.status === "connected" ? voiceState : undefined}
            onPause={() => setPause(true)}
            onResume={() => setPause(false)}
            onStop={() => void end("stopped")}
            onToggleOffRecord={() => setRecord(!offRecordRef.current)}
            micMuted={micMuted}
            onToggleMic={() => setMicMuted((m) => !m)}
            currentQuestion={current}
            insight={insight}
            questionsAsked={questionsInWindow(askedAt, nowMs)}
            questionBudget={DEFAULT_GATE.maxPer10Min}
            notice={
              <>
                {problem ? (
                  <Alert tone="danger" title="The session could not start">
                    {problem}
                  </Alert>
                ) : null}
                {streamDown ? (
                  <Alert tone="offline" title="Connection to the Shadow API lost">
                    Reconnecting to <code className="font-mono text-xs">{publicEnv.apiWsUrl}</code>.
                    Up to {QUEUE_LIMIT} events wait and are sent when it is back.
                  </Alert>
                ) : null}
              </>
            }
          />
        </div>
      ) : null}

      {/* After Stop, Shadow takes the page over: the ticketing app fades away and the
          debrief carries the story to the Work Map. */}
      {phase === "processing" || phase === "debrief" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 motion-safe:animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Shadow · Debrief</p>
              <LiveRecordingStatus state="idle" elapsed={elapsed} />
            </div>
            {endReason === "share_ended" ? <ShareEndedNotice /> : null}
            {phase === "processing" ? (
              <ProcessingSteps
                title="Processing the session"
                steps={[
                  ...steps,
                  { id: "workmap", label: "Draft the Work Map", status: "waiting" },
                ]}
              />
            ) : null}
            {phase === "debrief" && sessionId ? (
              <>
                {uploadProblem ? (
                  <Alert tone="danger" title="The recording could not be uploaded">
                    {uploadProblem} The debrief continues without the video.
                  </Alert>
                ) : null}
                <DebriefPanel
                  sessionId={sessionId}
                  voice={debriefVoice}
                  clock={clock}
                  isSent={isSent}
                  sendTypedLine={sendTypedLine}
                  onFinished={onDebriefFinished}
                  processing={steps}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog
        open={phase === "countdown"}
        onOpenChange={(open) => {
          // Escape or a click outside skips the count, like the Skip button.
          if (!open) void begin();
        }}
        title="Recording is about to start"
        hideTitle
        hideClose
        size="sm"
      >
        <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-6">
          <Countdown from={3} onDone={() => void begin()} />
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck aria-hidden="true" className="size-3.5 stroke-[1.75] text-ok" />
              Redaction on
            </span>
            <span className="inline-flex items-center gap-1">
              <EyeOff aria-hidden="true" className="size-3.5 stroke-[1.75]" />
              Off the record any time with <KbdCombo keys={["Alt", "O"]} />
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={cancelCountdown}>
            Cancel
          </Button>
        </div>
      </Dialog>

      {/* Hidden: the shared-tab stream feeds the frame loop and never renders. */}
      <video ref={video} muted playsInline className="hidden" />
    </div>
  );
}

/** Reads `?intent=start` (from the ⌘K palette). Inside Suspense, as `useSearchParams` requires. */
function StartIntent({ onStart }: { onStart: () => void }) {
  const intent = useSearchParams().get("intent");
  useEffect(() => {
    if (intent === "start") onStart();
  }, [intent, onStart]);
  return null;
}

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.kind === "network") return "The Shadow API is not reachable. Is it running (pnpm dev)?";
    return `The Shadow API returned an error (${err.status ?? "?"}${err.code ? `, ${err.code}` : ""}).`;
  }
  return err instanceof Error ? err.message : String(err);
}
