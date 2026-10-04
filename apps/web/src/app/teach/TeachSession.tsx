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
import { BookOpen, Map as MapIcon, Radio, RotateCcw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { DeskCoachProvider, type DeskCoachRender } from "@/components/desk/coach";
import { DeskSim } from "@/components/desk/DeskSim";
import { ListeningIndicator } from "@/components/recording";
import { describeDeskEvent } from "@/components/session/helpers";
import { TopBarActions, TopBarStatus } from "@/components/shell/slots";
import { ClipOverlay } from "@/components/tutor/ClipOverlay";
import { InterventionPanel } from "@/components/tutor/InterventionPanel";
import {
  buildIntervention,
  guardrailMoment,
  type Intervention,
  type JudgmentMatch,
  type MomentRef,
  matchJudgment,
  momentForFrame,
  predictPayload,
} from "@/components/tutor/logic";
import { MasteryReport as MasteryReportView } from "@/components/tutor/MasteryReport";
import { MasteryReportSlot } from "@/components/tutor/MasteryReportSlot";
import { PredictPanel } from "@/components/tutor/PredictPanel";
import { listeningStateFor, TutorVoicePanel } from "@/components/tutor/TutorVoicePanel";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  buttonClasses,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { formatMs } from "@/components/workmap/format";
import { publicEnv } from "@/env";
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
  chosen: Outcome | null;
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
  const [attempt, setAttempt] = useState(0);
  const [map, setMap] = useState<WorkMap | null>(null);
  const [mapMissing, setMapMissing] = useState<MapMissing>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [guardWarnings, setGuardWarnings] = useState<string[]>([]);
  const [intervention, setIntervention] = useState<InterventionState | null>(null);
  const [predict, setPredict] = useState<PredictState | null>(null);
  const [replay, setReplay] = useState<{ frameId: string; ref: MomentRef | null } | null>(null);
  const [report, setReport] = useState<MasteryReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const interventionRef = useRef<InterventionState | null>(null);
  interventionRef.current = intervention;

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
    void attempt; // a retry re-runs this effect
    setPhase("loading");
    setProblem(null);
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
        setMapMissing(loaded.missing);
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
  }, [workMapId, attempt]);

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
      setPredict({ ticketId, chosen: null, match, pending: false, result: null, error: null });
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
        setStats((st) => ({ ...st, saved: st.saved + 1 }));
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
        // The session id lets the API score this verdict in the mastery report.
        verdict = await withTimeout(preSave(action, sessionId ?? undefined), GUARD_TIMEOUT_MS);
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
        setStats((st) => ({ ...st, held: st.held + 1 }));
        const built = buildIntervention(mapRef.current, verdict, action.ticket.id, action.outcome);
        const tutorNotified = control("[INTERVENE]", built.payload);
        setIntervention({ intervention: built, tutorNotified, resolvedOutcome: null });
      }
      return verdict;
    },
    [control, warn, sessionId],
  );

  // The tutor calls this after explaining (agents/tutor.md).
  useConversationClientTool("replay_clip", (params: Record<string, unknown>) => {
    const parsed = ReplayClipParams.safeParse(params);
    if (!parsed.success) return "replay_clip needs a frameId.";
    const found = momentForFrame(
      mapRef.current,
      parsed.data.frameId,
      interventionRef.current?.intervention.primary ?? null,
    );
    setReplay({ frameId: parsed.data.frameId, ref: found });
    if (!found) return `No moment for frame ${parsed.data.frameId} in the Work Map.`;
    return expertSessionId
      ? "Playing the expert's clip on the learner's screen."
      : "Showing the expert's quote; the recording is not linked on this page.";
  });

  const choosePrediction = useCallback(
    async (outcome: Outcome) => {
      if (!predict || !sessionId) return;
      setPredict({ ...predict, chosen: outcome, pending: true, error: null });
      try {
        const result = await submitLearnerPrediction(sessionId, {
          ticketId: predict.ticketId,
          stepId: predict.match.predictId,
          predictedOutcome: outcome,
          tMs: clock(),
        });
        setPredict((p) => (p ? { ...p, pending: false, result } : p));
        setStats((st) => ({
          ...st,
          predicted: st.predicted + 1,
          predictedRight: st.predictedRight + (result.correct ? 1 : 0),
        }));
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
    setReportError(null);
    if (voiceLiveRef.current) voice.stop();
    try {
      setReport(await getMastery(sessionId));
      setPhase("ended");
    } catch (err) {
      setReportError(describeError(err));
    } finally {
      setEnding(false);
    }
  }, [sessionId, voice.stop]);

  const primary = intervention?.intervention.primary ?? null;
  const listening = listeningStateFor(voice.status, voice.mode);

  // Coaching anchored next to the open ticket's actions inside DeskSim (desk/coach.tsx).
  const renderCoach = useCallback<DeskCoachRender>(
    (ticketId, api) => {
      if (intervention && intervention.intervention.payload.ticketId === ticketId) {
        return (
          <InterventionPanel
            intervention={intervention.intervention}
            expertName={expertName}
            resolvedOutcome={intervention.resolvedOutcome}
            tutorNotified={intervention.tutorNotified}
            onReplay={
              primary
                ? () =>
                    setReplay({
                      frameId: primary.evidence.moment.frameId,
                      ref: guardrailMoment(primary),
                    })
                : null
            }
            onChoose={api.choose}
            busy={api.busy}
          />
        );
      }
      if (predict && predict.ticketId === ticketId) {
        return (
          <PredictPanel
            ticketId={predict.ticketId}
            condition={predict.match.guardrail.condition}
            expertName={expertName}
            voiceLive={voiceLive}
            pending={predict.pending}
            chosen={predict.chosen}
            result={predict.result}
            error={predict.error}
            onChoose={(o) => void choosePrediction(o)}
          />
        );
      }
      return null;
    },
    [intervention, predict, expertName, primary, voiceLive, choosePrediction],
  );

  return (
    <>
      <TopBarStatus>
        {phase === "ready" ? (
          <span className="hidden items-center gap-1.5 text-xs text-ink-muted md:inline-flex">
            <span className="max-w-40 truncate">{learnerName ?? "New hire"}</span>
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
            <SessionClock since={startedAt.current} />
          </span>
        ) : null}
        <span className="hidden sm:contents">
          <ListeningIndicator state={listening} />
        </span>
        <span className="contents sm:hidden">
          <ListeningIndicator state={listening} compact />
        </span>
      </TopBarStatus>
      {phase === "ready" ? (
        <TopBarActions>
          <Button size="sm" variant="secondary" onClick={() => void finish()} loading={ending}>
            Finish session
          </Button>
        </TopBarActions>
      ) : null}

      <PageHeader
        title="Teach"
        description={`Work new tickets on your own. Shadow checks every save against ${map ? `${expertName}'s` : "the expert's"} Work Map and holds a risky one before it is saved.`}
        meta={
          map ? (
            <>
              <Badge tone="muted" icon={<MapIcon aria-hidden="true" />}>
                {map.workflow}
              </Badge>
              <Badge tone="muted" className="font-mono">
                v{map.version}
              </Badge>
              <span className="text-xs text-ink-muted">in {expertName}'s words</span>
            </>
          ) : phase === "loading" ? (
            <Skeleton className="h-5 w-48" />
          ) : null
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Practice desk" className="flex min-w-0 flex-col gap-3">
          {phase === "failed" && problem ? (
            <Alert
              tone="offline"
              title="Can't reach the Shadow API"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw aria-hidden="true" />}
                  onClick={() => setAttempt((a) => a + 1)}
                >
                  Retry
                </Button>
              }
            >
              Teach loads the Work Map and tickets from{" "}
              <span className="font-mono text-xs text-ink">{publicEnv.apiUrl}</span> ({problem}).
              Start it with <code className="font-mono text-xs text-ink">pnpm dev</code> and retry.
            </Alert>
          ) : null}
          {mapMissing && phase !== "loading" ? <NoMapNotice missing={mapMissing} /> : null}
          {guardWarnings.map((w, i) => (
            <Alert
              // biome-ignore lint/suspicious/noArrayIndexKey: warnings are append-only and never reordered
              key={i}
              tone="danger"
              title="Saved without a guard check"
            >
              {w}
            </Alert>
          ))}
          {reportError ? (
            <Alert
              tone="danger"
              title="The mastery report could not be loaded"
              action={
                <Button size="sm" variant="secondary" onClick={() => void finish()}>
                  Retry
                </Button>
              }
            >
              {reportError}.
            </Alert>
          ) : null}

          {phase === "loading" ? <DeskSkeleton /> : null}
          {phase === "ready" ? (
            tickets.length === 0 ? (
              <Alert tone="info" title="No new-hire tickets">
                The API returned an empty <span className="font-mono text-xs">new_hire</span> ticket
                set. Check <span className="font-mono text-xs">seed/tickets.json</span>.
              </Alert>
            ) : (
              <DeskCoachProvider value={renderCoach}>
                <DeskSim
                  tickets={tickets}
                  mode="teach"
                  clock={clock}
                  onDeskEvent={onDeskEvent}
                  preSave={onPreSave}
                />
              </DeskCoachProvider>
            )
          ) : null}
          {phase === "ended" && report ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-panel border border-rule bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Session complete</p>
                  <p className="figures text-ui text-ink-muted">
                    {formatMs(clock())} · {stats.saved} {stats.saved === 1 ? "save" : "saves"} ·{" "}
                    {stats.held} held by Shadow
                    {stats.predicted > 0
                      ? ` · ${stats.predictedRight} of ${stats.predicted} predictions right`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {map ? (
                    <ButtonLink
                      href={`/map/${map.id}`}
                      variant="secondary"
                      size="sm"
                      icon={<MapIcon aria-hidden="true" />}
                    >
                      Open the Work Map
                    </ButtonLink>
                  ) : null}
                  {/* A full load: a new session needs fresh state and a new session id. */}
                  <a href="/teach" className={buttonClasses({ size: "sm" })}>
                    <RotateCcw aria-hidden="true" />
                    Start a new session
                  </a>
                </div>
              </div>
              {map ? (
                <MasteryReportView
                  report={report}
                  workMap={map}
                  onPlayClip={(item) =>
                    setReplay({
                      frameId: item.frameId,
                      ref: {
                        moment: { tMs: item.tMs, frameId: item.frameId, clip: item.clip },
                        quote: item.quote,
                        title: item.title,
                      },
                    })
                  }
                />
              ) : (
                <MasteryReportSlot report={report} />
              )}
            </div>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-16 lg:self-start">
          <TutorVoicePanel
            status={voice.status}
            mode={voice.mode}
            error={voice.error}
            transcript={voice.transcript}
            onStart={() => void voice.start()}
            onStop={voice.stop}
            expertName={map?.expertName ?? "the expert"}
          />
          {phase === "ready" || phase === "ended" ? (
            <section
              aria-labelledby="teach-stats"
              className="overflow-hidden rounded-panel border border-rule bg-surface"
            >
              <h2
                id="teach-stats"
                className="flex h-9 items-center border-b border-rule px-4 text-xs font-medium text-ink-muted"
              >
                This session
              </h2>
              <dl className="grid grid-cols-3 gap-px bg-rule">
                <MiniStat label="Saved" value={`${stats.saved}/${tickets.length}`} />
                <MiniStat label="Held" value={String(stats.held)} />
                <MiniStat
                  label="Predicted"
                  value={stats.predicted > 0 ? `${stats.predictedRight}/${stats.predicted}` : "–"}
                />
              </dl>
            </section>
          ) : null}
        </div>
      </div>
      <ClipOverlay
        frameId={replay?.frameId ?? null}
        moment={replay?.ref ?? null}
        expertName={expertName}
        expertSessionId={expertSessionId}
        onClose={() => setReplay(null)}
      />
    </>
  );
}

interface SessionStats {
  saved: number;
  held: number;
  predicted: number;
  predictedRight: number;
}

const EMPTY_STATS: SessionStats = { saved: 0, held: 0, predicted: 0, predictedRight: 0 };

/** Why there is no map: nothing is published, or the `?workMap=` id was not found. */
type MapMissing = { kind: "published" } | { kind: "id"; id: string } | null;

function NoMapNotice({ missing }: { missing: Exclude<MapMissing, null> }) {
  return (
    <div className="flex flex-col gap-3 rounded-panel border border-rule bg-surface px-4 py-3.5 sm:flex-row sm:items-start">
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-panel border border-rule bg-sunken text-ink-muted"
      >
        <BookOpen className="size-4 stroke-[1.75]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-ink">
          {missing.kind === "published" ? (
            "No Work Map is published yet"
          ) : (
            <>
              Work Map <span className="font-mono text-xs">{missing.id}</span> was not found
            </>
          )}
        </p>
        <p className="mt-0.5 max-w-prose text-ui text-ink-muted">
          You can still practise: every save is checked against the guardrails. Without a map,
          Shadow can't quote an expert or ask what you would do. Capture an expert working the
          queue, or look at the sample map to see what one holds.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href="/capture" size="sm" icon={<Radio aria-hidden="true" />}>
            Capture an expert
          </ButtonLink>
          <ButtonLink
            href="/map/latest?fixture=1"
            variant="secondary"
            size="sm"
            icon={<MapIcon aria-hidden="true" />}
          >
            Open the sample map
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-4 py-2.5">
      <dt className="text-2xs text-ink-faint">{label}</dt>
      <dd className="figures text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** Elapsed session time, ticking once a second, for the top bar. */
function SessionClock({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="figures font-mono" title="Session time">
      <span className="sr-only">Session time </span>
      {formatMs(since === null ? 0 : now - since)}
    </time>
  );
}

/** Loading state in the shape of the desk: header, queue rows, ticket detail. */
function DeskSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <span className="sr-only">Loading the Work Map and tickets</span>
      <div className="flex h-11 items-center border-b border-rule px-4">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 border-b border-rule p-4 md:border-r md:border-b-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 p-6">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-28 w-full" />
          <Skeleton className="mt-4 h-8 w-full" />
        </div>
      </div>
    </div>
  );
}

async function loadMap(workMapId: string | null): Promise<{
  map: WorkMap | null;
  missing: MapMissing;
}> {
  try {
    const map = workMapId ? await getWorkMap(workMapId) : await getPublishedWorkMap();
    return { map, missing: null };
  } catch (err) {
    if (err instanceof ApiClientError && err.kind === "http" && err.status === 404) {
      return {
        map: null,
        missing: workMapId ? { kind: "id", id: workMapId } : { kind: "published" },
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
