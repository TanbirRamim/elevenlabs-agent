"use client";

import { useConversationClientTool } from "@elevenlabs/react";
import type {
  DeskEvent,
  GuardVerdict,
  MasteryReport,
  Outcome,
  PendingAction,
  PublicTicket,
  WorkMap,
} from "@shadow/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { DeskSim } from "@/components/desk/DeskSim";
import { describeDeskEvent } from "@/components/session/helpers";
import { ClipOverlay } from "@/components/tutor/ClipOverlay";
import { InterventionPanel } from "@/components/tutor/InterventionPanel";
import {
  buildIntervention,
  findMoment,
  type Intervention,
  type JudgmentMatch,
  matchJudgment,
  predictPayload,
} from "@/components/tutor/logic";
import { MasteryReportSlot } from "@/components/tutor/MasteryReportSlot";
import { PredictPanel } from "@/components/tutor/PredictPanel";
import { TutorVoicePanel } from "@/components/tutor/TutorVoicePanel";
import {
  ApiClientError,
  createSession,
  getMastery,
  getPublishedWorkMap,
  getTickets,
  getWorkMap,
  type LearnerPredictionResponse,
  preSave,
  submitLearnerPrediction,
} from "@/lib/api";
import { openSessionStream, type SessionStream } from "@/lib/stream";
import { type ControlPrefix, useVoice } from "@/lib/voice";

/** Server-side judge times out at 2.5 s; this covers that plus the network. */
const GUARD_TIMEOUT_MS = 6000;

const ReplayClipParams = z.object({ frameId: z.string().min(1) });

type Phase = "loading" | "ready" | "failed" | "ended";

interface PredictState {
  ticketId: string;
  match: JudgmentMatch;
  pending: boolean;
  result: LearnerPredictionResponse | null;
  error: string | null;
}

interface InterventionState {
  intervention: Intervention;
  tutorNotified: boolean;
  resolvedOutcome: Outcome | null;
}

export interface TeachSessionProps {
  /** `?workMap=`: teach from this map instead of the latest published one. */
  workMapId: string | null;
  /** `?expertSession=`: the capture session whose recording holds the expert's clips. */
  expertSessionId: string | null;
  learnerName: string | null;
}

/**
 * Module 3, Teach (TAN-10). Hosts DeskSim in teach mode, runs every save through the guard,
 * and drives the tutor: `[PREDICT]` at judgment points, `[INTERVENE]` on a BLOCK, and the
 * `replay_clip` client tool. Pure decisions live in components/tutor/logic.ts.
 */
export function TeachSession({ workMapId, expertSessionId, learnerName }: TeachSessionProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [problem, setProblem] = useState<string | null>(null);
  const [map, setMap] = useState<WorkMap | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [guardWarnings, setGuardWarnings] = useState<string[]>([]);
  const [intervention, setIntervention] = useState<InterventionState | null>(null);
  const [predict, setPredict] = useState<PredictState | null>(null);
  const [replayFrameId, setReplayFrameId] = useState<string | null>(null);
  const [report, setReport] = useState<MasteryReport | null>(null);
  const [ending, setEnding] = useState(false);

  const startedAt = useRef<number | null>(null);
  const clock = useCallback(
    () => (startedAt.current === null ? 0 : Date.now() - startedAt.current),
    [],
  );
  const mapRef = useRef<WorkMap | null>(null);
  const stream = useRef<SessionStream | null>(null);
  const predicted = useRef(new Set<string>());

  const expertName = map?.expertName ?? "The expert";
  const dynamicVariables = useMemo(
    () => ({ expert_name: expertName, learner_name: learnerName ?? "the new hire" }),
    [expertName, learnerName],
  );
  const voice = useVoice({ agent: "tutor", dynamicVariables, clock });
  const voiceLive = voice.status === "connected";
  const voiceLiveRef = useRef(false);
  voiceLiveRef.current = voiceLive;

  /** Sends a control message only when a conversation is live; the SDK throws otherwise. */
  const control = useCallback(
    (prefix: ControlPrefix, payload: object): boolean => {
      if (!voiceLiveRef.current) return false;
      try {
        voice.sendControl(prefix, payload);
        return true;
      } catch {
        return false;
      }
    },
    [voice.sendControl],
  );

  // Load the map, the new-hire tickets, and create the teach session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadMap(workMapId);
        const [{ tickets: list }, session] = await Promise.all([
          getTickets("new_hire"),
          createSession({ mode: "teach", ...(loaded.map ? { workMapId: loaded.map.id } : {}) }),
        ]);
        if (cancelled) return;
        mapRef.current = loaded.map;
        setMap(loaded.map);
        setMapNotice(loaded.notice);
        setTickets(list);
        setSessionId(session.id);
        startedAt.current = Date.now();
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
  }, [workMapId]);

  // Desk events go to the API, which scores mastery from them.
  useEffect(() => {
    if (!sessionId) return;
    const s = openSessionStream({ sessionId });
    stream.current = s;
    return () => {
      s.close();
      stream.current = null;
    };
  }, [sessionId]);

  const openJudgmentPoint = useCallback(
    (ticketId: string) => {
      const current = mapRef.current;
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!current || !ticket || predicted.current.has(ticketId)) return;
      const match = matchJudgment(current, ticket);
      if (!match) return;
      predicted.current.add(ticketId);
      setPredict({ ticketId, match, pending: false, result: null, error: null });
      control("[PREDICT]", predictPayload(match, ticketId));
    },
    [tickets, control],
  );

  const onDeskEvent = useCallback(
    (event: DeskEvent) => {
      stream.current?.send({ type: "desk_event", event });
      if (event.type === "input_activity") {
        if (voiceLiveRef.current) voice.markActivity();
        return;
      }
      const summary = describeDeskEvent(event);
      if (summary && voiceLiveRef.current) voice.sendScreen(summary, event.tMs);
      if (event.type === "ticket_opened") openJudgmentPoint(event.ticketId);
      if (event.type === "action_committed") {
        setIntervention((cur) =>
          cur && cur.intervention.payload.ticketId === event.ticketId
            ? { ...cur, resolvedOutcome: event.outcome }
            : cur,
        );
      }
    },
    [voice.markActivity, voice.sendScreen, openJudgmentPoint],
  );

  const warn = useCallback((text: string) => setGuardWarnings((w) => [...w.slice(-2), text]), []);

  // Teach mode: a BLOCK goes back to DeskSim (it pauses the save) and starts the intervention.
  const onPreSave = useCallback(
    async (action: PendingAction): Promise<GuardVerdict> => {
      let verdict: GuardVerdict;
      try {
        verdict = await withTimeout(preSave(action), GUARD_TIMEOUT_MS);
      } catch (err) {
        warn(
          `Guard unavailable (${describeError(err)}). ${action.ticket.id} was saved without a check.`,
        );
        return { decision: "ALLOW", ruleIds: [], source: "timeout_allow" };
      }
      if (verdict.source === "timeout_allow") {
        warn(`The guard's judge timed out on ${action.ticket.id}; the save was allowed.`);
      }
      if (verdict.decision === "BLOCK") {
        const built = buildIntervention(mapRef.current, verdict, action.ticket.id, action.outcome);
        const tutorNotified = control("[INTERVENE]", built.payload);
        setIntervention({ intervention: built, tutorNotified, resolvedOutcome: null });
      }
      return verdict;
    },
    [control, warn],
  );

  // The tutor calls this after explaining (agents/tutor.md).
  useConversationClientTool("replay_clip", (params: Record<string, unknown>) => {
    const parsed = ReplayClipParams.safeParse(params);
    if (!parsed.success) return "replay_clip needs a frameId.";
    setReplayFrameId(parsed.data.frameId);
    const found = findMoment(mapRef.current, parsed.data.frameId);
    if (!found) return `No moment for frame ${parsed.data.frameId} in the Work Map.`;
    return expertSessionId
      ? "Playing the expert's clip on the learner's screen."
      : "Showing the expert's quote; the recording is not linked on this page.";
  });

  const choosePrediction = useCallback(
    async (outcome: Outcome) => {
      if (!predict || !sessionId) return;
      setPredict({ ...predict, pending: true, error: null });
      try {
        const result = await submitLearnerPrediction(sessionId, {
          ticketId: predict.ticketId,
          stepId: predict.match.predictId,
          predictedOutcome: outcome,
          tMs: clock(),
        });
        setPredict((p) => (p ? { ...p, pending: false, result } : p));
      } catch (err) {
        setPredict((p) =>
          p
            ? {
                ...p,
                pending: false,
                error: `Your prediction could not be recorded: ${describeError(err)}`,
              }
            : p,
        );
      }
    },
    [predict, sessionId, clock],
  );

  const finish = useCallback(async () => {
    if (!sessionId) return;
    setEnding(true);
    if (voiceLiveRef.current) voice.stop();
    try {
      setReport(await getMastery(sessionId));
      setPhase("ended");
    } catch (err) {
      setProblem(`The mastery report could not be loaded: ${describeError(err)}`);
    } finally {
      setEnding(false);
    }
  }, [sessionId, voice.stop]);

  const replayMoment = replayFrameId ? findMoment(map, replayFrameId) : null;
  const interventionFrame = intervention?.intervention.payload.frameId ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {phase === "loading" && <p className="text-sm text-neutral-500">Loading…</p>}
          {phase === "ready" && (
            <button
              type="button"
              onClick={() => void finish()}
              disabled={ending}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
            >
              Finish and see mastery
            </button>
          )}
          {map && (
            <p className="text-xs text-neutral-500">
              Teaching from {map.workflow} · v{map.version} · {expertName}
            </p>
          )}
        </div>
        {problem && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {problem}
          </p>
        )}
        {mapNotice && (
          <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {mapNotice}
          </p>
        )}
        {guardWarnings.map((w, i) => (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: warnings are append-only and never reordered
            key={i}
            role="alert"
            className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            {w}
          </p>
        ))}
        {intervention && (
          <InterventionPanel
            intervention={intervention.intervention}
            expertName={expertName}
            resolvedOutcome={intervention.resolvedOutcome}
            tutorNotified={intervention.tutorNotified}
            onReplay={interventionFrame ? () => setReplayFrameId(interventionFrame) : null}
          />
        )}
        {predict && (
          <PredictPanel
            ticketId={predict.ticketId}
            condition={predict.match.guardrail.condition}
            voiceLive={voiceLive}
            pending={predict.pending}
            result={predict.result}
            error={predict.error}
            onChoose={(o) => void choosePrediction(o)}
          />
        )}
        {report && <MasteryReportSlot report={report} />}
        {phase !== "loading" && phase !== "failed" && (
          <DeskSim
            tickets={tickets}
            mode="teach"
            clock={clock}
            onDeskEvent={onDeskEvent}
            preSave={onPreSave}
          />
        )}
      </section>
      <TutorVoicePanel
        status={voice.status}
        mode={voice.mode}
        error={voice.error}
        transcript={voice.transcript}
        onStart={() => void voice.start()}
        onStop={voice.stop}
      />
      {replayFrameId && (
        <ClipOverlay
          frameId={replayFrameId}
          moment={replayMoment}
          expertName={expertName}
          expertSessionId={expertSessionId}
          onClose={() => setReplayFrameId(null)}
        />
      )}
    </div>
  );
}

async function loadMap(workMapId: string | null): Promise<{
  map: WorkMap | null;
  notice: string | null;
}> {
  try {
    const map = workMapId ? await getWorkMap(workMapId) : await getPublishedWorkMap();
    return { map, notice: null };
  } catch (err) {
    if (err instanceof ApiClientError && err.kind === "http" && err.status === 404) {
      return {
        map: null,
        notice: workMapId
          ? `Work Map "${workMapId}" was not found. Saves are still checked, but Shadow can't quote the expert or ask for predictions.`
          : "No Work Map is published yet. Saves are still checked, but Shadow can't quote the expert or ask for predictions. Publish one from the Work Map page, or open /teach?workMap=<id>.",
      };
    }
    throw err;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.kind === "network") return "the Shadow API is not reachable";
    return `the Shadow API returned ${err.status}${err.code ? ` ${err.code}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}
