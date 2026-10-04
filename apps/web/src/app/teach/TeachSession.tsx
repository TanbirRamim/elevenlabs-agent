"use client";

import { useConversationClientTool } from "@elevenlabs/react";
import { type RuleRef, rulesFromWorkMap } from "@shadow/guard";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { ACTION_LABELS } from "@/components/desk/ActionBar";
import { DeskCoachProvider, type DeskCoachRender } from "@/components/desk/coach";
import { DeskSim } from "@/components/desk/DeskSim";
import { queueItemId } from "@/components/desk/TicketQueue";
import { DESK_ROOT_ID } from "@/components/desk/types";
import { describeDeskEvent } from "@/components/session/helpers";
import { ClipOverlay } from "@/components/tutor/ClipOverlay";
import { InterventionPanel } from "@/components/tutor/InterventionPanel";
import {
  buildIntervention,
  explainPayload,
  guardrailMoment,
  type Intervention,
  type JudgmentMatch,
  type MomentRef,
  matchJudgment,
  momentForFrame,
  oncePerKey,
  pickGuidedStart,
  predictPayload,
  showPredictFor,
} from "@/components/tutor/logic";
import { MasteryReport as MasteryReportView } from "@/components/tutor/MasteryReport";
import { MasteryReportSlot } from "@/components/tutor/MasteryReportSlot";
import { PredictPanel } from "@/components/tutor/PredictPanel";
import { listeningStateFor } from "@/components/tutor/TutorVoicePanel";
import { Alert, Avatar, Button, ButtonLink, buttonClasses, Skeleton } from "@/components/ui";
import { formatMs } from "@/components/workmap/format";
import { publicEnv } from "@/env";
import {
  ApiClientError,
  createSession,
  getMastery,
  getPublishedWorkMap,
  getTickets,
  getWorkMap,
  getWorkMapMarkdown,
  type LearnerPredictionResponse,
  submitLearnerPrediction,
} from "@/lib/api";
import { type ConnectorVerdict, shadow } from "@/lib/connector";
import { REFERENCE_RULES } from "@/lib/connector/referenceRules";
import { openSessionStream, type SessionStream } from "@/lib/stream";
import { type ControlPrefix, formatWorkMapContext, useVoice } from "@/lib/voice";
import { ConnectorChip } from "./ConnectorChip";
import { GuidedStart } from "./GuidedStart";
import { TeachDock } from "./TeachDock";

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
 * and drives the tutor: the Work Map as `[WORKMAP]` context when the voice connects, `[PREDICT]`
 * at judgment points, `[EXPLAIN]` once the learner has answered, `[INTERVENE]` on a BLOCK, and
 * the `replay_clip` client tool. Pure decisions live in components/tutor/logic.ts.
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
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [mapNoticeDismissed, setMapNoticeDismissed] = useState(false);
  /** The last connector verdict per ticket, shown as the chip beside its actions. */
  const [checks, setChecks] = useState<Record<string, ConnectorVerdict>>({});
  /** True while the last check could not reach the API and ran in the browser instead. */
  const [offline, setOffline] = useState(false);
  // Hidden until localStorage is read after mount, so a dismissed guide never flashes.
  const [guideDismissed, setGuideDismissed] = useState(true);
  const [hint, setHint] = useState<{ ticketId: string; outcome: Outcome } | null>(null);
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
  /** One `[EXPLAIN]` per ticket, however often it is re-opened or re-answered. */
  const explained = useRef(oncePerKey());

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

  // The tutor's knowledge base: the map's Markdown, sent once per voice connection.
  const mapSentFor = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceLive) {
      mapSentFor.current = null;
      return;
    }
    const mapId = map?.id;
    if (!mapId || mapSentFor.current === mapId) return;
    mapSentFor.current = mapId;
    // Not cancelled on re-render: the in-flight fetch delivers for whichever map is still current.
    getWorkMapMarkdown(mapId)
      .then((markdown) => {
        if (mapSentFor.current !== mapId) return;
        const delivered = voiceLiveRef.current && voice.sendContext(formatWorkMapContext(markdown));
        if (!delivered) mapSentFor.current = null;
      })
      .catch(() => {
        // Not fatal: [PREDICT], [EXPLAIN] and [INTERVENE] carry the quotes the tutor needs.
        if (mapSentFor.current === mapId) mapSentFor.current = null;
      });
  }, [voiceLive, map?.id, voice.sendContext]);

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
      if (event.type === "ticket_opened") {
        setOpenTicketId(event.ticketId);
        openJudgmentPoint(event.ticketId);
      }
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

  // The machine rules the connector falls back on when the API can't answer: the loaded map's,
  // topped up with the reference rules bundled from seed/ for ids the map has no machine rule
  // for (judge-only guardrails like "card used without permission" need the API otherwise).
  const fallbackRules = useMemo<readonly RuleRef[]>(() => {
    if (!map) return REFERENCE_RULES;
    const own = rulesFromWorkMap(map);
    const ids = new Set(own.map((r) => r.id));
    return [...own, ...REFERENCE_RULES.filter((r) => !ids.has(r.id))];
  }, [map]);
  const fallbackRulesRef = useRef(fallbackRules);
  fallbackRulesRef.current = fallbackRules;

  // The guided first click: the first ticket whose save a loaded rule would hold, for any
  // map's rule ids (a refund first, then any other outcome a rule forbids).
  const guided = useMemo(() => pickGuidedStart(tickets, fallbackRules), [tickets, fallbackRules]);

  useEffect(() => {
    setGuideDismissed(readGuideDismissed());
  }, []);

  const dismissGuide = useCallback(() => {
    setGuideDismissed(true);
    writeGuideDismissed();
  }, []);

  const startGuide = useCallback(
    (ticketId: string, outcome: Outcome) => {
      dismissGuide();
      setHint({ ticketId, outcome });
      document.getElementById(queueItemId(ticketId))?.click();
    },
    [dismissGuide],
  );

  // Highlight the guided action on the guided ticket until the learner saves something.
  useEffect(() => {
    if (!hint || openTicketId !== hint.ticketId) return;
    const button = findActionButton(ACTION_LABELS[hint.outcome]);
    if (!button) return;
    button.setAttribute("data-shadow-hint", "");
    return () => button.removeAttribute("data-shadow-hint");
  }, [hint, openTicketId]);

  // Teach mode: a BLOCK goes back to DeskSim (it pauses the save) and starts the intervention.
  const onPreSave = useCallback(
    async (action: PendingAction): Promise<GuardVerdict> => {
      // The Singoda AI connector: the one pre-commit call any helpdesk adds (docs/CONNECTOR.md).
      // It fails open with a warning when Singoda AI can't answer in time.
      setHint(null);
      const verdict = await shadow.check(action, {
        sessionId,
        fallbackRules: fallbackRulesRef.current,
      });
      setChecks((c) => ({ ...c, [action.ticket.id]: verdict }));
      setOffline(verdict.via !== "api");
      // In the browser fallback the offline banner says what ran; fail-open still warns loudly.
      if (verdict.warning && verdict.via !== "browser") warn(verdict.warning);
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
        if (explained.current.take(predict.ticketId)) {
          const sent = control(
            "[EXPLAIN]",
            explainPayload(predict.match, predict.ticketId, expertName, {
              predictedOutcome: outcome,
              correct: result.correct,
            }),
          );
          // Not live yet: let a later answer on this ticket explain once the voice is on.
          if (!sent) explained.current.release(predict.ticketId);
        }
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
    [predict, sessionId, clock, control, expertName],
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
      const check = checks[ticketId];
      const held = check?.decision === "BLOCK";
      if (intervention && intervention.intervention.payload.ticketId === ticketId) {
        return (
          <>
            {check && held ? <ConnectorChip verdict={check} /> : null}
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
            {check && !held ? <ConnectorChip verdict={check} subtle /> : null}
          </>
        );
      }
      if (check) return <ConnectorChip verdict={check} subtle={!held} />;
      return null;
    },
    [intervention, expertName, primary, checks],
  );

  const notices = (
    <>
      {phase === "failed" && problem ? (
        <Alert
          tone="offline"
          title="Can't reach the Singoda AI API"
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
          <span className="font-mono text-xs text-ink">{publicEnv.apiUrl}</span> ({problem}). Start
          it with <code className="font-mono text-xs text-ink">pnpm dev</code> and retry.
        </Alert>
      ) : null}
      {offline ? (
        <Alert tone="offline" title="Live API offline — running Singoda AI's rules in the browser">
          Saves are checked on this page against{" "}
          {map
            ? "the Work Map's machine rules plus Singoda AI's reference rules"
            : "Singoda AI's reference rules"}
          , so a save a rule forbids is still held. Guardrails only the judge can decide are skipped
          until <span className="font-mono text-xs text-ink">{publicEnv.apiUrl}</span> answers
          again.
        </Alert>
      ) : null}
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
    </>
  );
  const hasNotice =
    (phase === "failed" && problem !== null) ||
    offline ||
    guardWarnings.length > 0 ||
    reportError !== null;

  const predictCallout =
    predict &&
    showPredictFor(
      predict.ticketId,
      openTicketId,
      intervention?.intervention.payload.ticketId ?? null,
    ) ? (
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
    ) : !guideDismissed && guided && openTicketId === null ? (
      <GuidedStart
        ticketId={guided.ticketId}
        outcome={guided.outcome}
        onStart={() => startGuide(guided.ticketId, guided.outcome)}
        onDismiss={dismissGuide}
      />
    ) : null;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {phase === "loading" ? (
        <div className="min-h-0 flex-1">
          <DeskSkeleton />
        </div>
      ) : null}

      {phase === "failed" ? (
        <div className="mx-auto w-full max-w-xl px-4 py-10">{notices}</div>
      ) : null}

      {/* The standalone ticketing app: the whole viewport belongs to DeskSim while the learner
          works; Singoda AI is only the floating dock, its callouts, and the pause on a held save. */}
      {phase === "ready" ? (
        // Bottom padding keeps the app's last row reachable above the floating dock.
        <div className="relative min-h-0 flex-1 pb-36 sm:pb-[4.75rem]">
          {tickets.length === 0 ? (
            <div className="mx-auto w-full max-w-xl px-4 py-10">
              <Alert tone="info" title="No new-hire tickets">
                The API returned an empty <span className="font-mono text-xs">new_hire</span> ticket
                set. Check <span className="font-mono text-xs">seed/tickets.json</span>.
              </Alert>
            </div>
          ) : (
            <DeskCoachProvider value={renderCoach}>
              <DeskSim
                tickets={tickets}
                mode="teach"
                clock={clock}
                onDeskEvent={onDeskEvent}
                preSave={onPreSave}
                chrome="app"
              />
            </DeskCoachProvider>
          )}

          {mapMissing && !mapNoticeDismissed ? (
            <div className="pointer-events-none absolute inset-x-0 top-14 z-40 flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-2xl shadow-overlay">
                <NoMapNotice missing={mapMissing} onDismiss={() => setMapNoticeDismissed(true)} />
              </div>
            </div>
          ) : null}

          <TeachDock
            learnerName={learnerName}
            since={startedAt.current}
            saved={stats.saved}
            total={tickets.length}
            held={stats.held}
            voiceState={listening}
            voice={{
              status: voice.status,
              mode: voice.mode,
              error: voice.error,
              transcript: voice.transcript,
              onStart: () => void voice.start(),
              onStop: voice.stop,
            }}
            expertName={map?.expertName ?? "the expert"}
            onFinish={() => void finish()}
            finishing={ending}
            callout={predictCallout}
            notice={hasNotice ? notices : undefined}
          />
        </div>
      ) : null}

      {/* At Finish, Singoda AI takes the page over: the ticketing app gives way to the mastery
          report, like capture's debrief. */}
      {phase === "ended" && report ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8 motion-safe:animate-fade-in sm:py-10">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name="Singoda AI" shadow size="md" className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-muted">
                    Singoda AI · Mastery report
                    {map ? (
                      <>
                        {" "}
                        · {map.workflow} <span className="font-mono">v{map.version}</span>
                      </>
                    ) : null}
                  </p>
                  <h1 className="mt-0.5 text-xl font-semibold text-balance text-ink">
                    Session complete
                  </h1>
                  <p className="figures mt-0.5 text-ui text-ink-muted">
                    {learnerName ?? "New hire"} · {formatMs(clock())} · {stats.saved}{" "}
                    {stats.saved === 1 ? "save" : "saves"} · {stats.held} held by Singoda AI
                    {stats.predicted > 0
                      ? ` · ${stats.predictedRight} of ${stats.predicted} predictions right`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
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
            </header>
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
        </div>
      ) : null}

      <ClipOverlay
        frameId={replay?.frameId ?? null}
        moment={replay?.ref ?? null}
        expertName={expertName}
        expertSessionId={expertSessionId}
        onClose={() => setReplay(null)}
      />
    </div>
  );
}

const GUIDE_KEY = "shadow.teach.guide.dismissed.v1";

function readGuideDismissed(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeGuideDismissed(): void {
  try {
    window.localStorage.setItem(GUIDE_KEY, "1");
  } catch {
    // Storage blocked (private window): the guide simply shows again next visit.
  }
}

/** DeskSim's action button with this exact label (DeskSim owns the markup; we only read it). */
function findActionButton(label: string): HTMLButtonElement | null {
  const root = document.getElementById(DESK_ROOT_ID);
  if (!root) return null;
  for (const b of root.querySelectorAll("button")) {
    // Skip aria-hidden parts (the keyboard-shortcut hint) the way the accessible name does.
    const copy = b.cloneNode(true) as HTMLElement;
    for (const hidden of copy.querySelectorAll("[aria-hidden='true']")) hidden.remove();
    if (copy.textContent?.trim() === label) return b;
  }
  return null;
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

function NoMapNotice({
  missing,
  onDismiss,
}: {
  missing: Exclude<MapMissing, null>;
  onDismiss: () => void;
}) {
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
          Singoda AI can't quote an expert or ask what you would do. Capture an expert working the
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
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Practise anyway
          </Button>
        </div>
      </div>
    </div>
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

function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.kind === "network") return "the Singoda AI API is not reachable";
    return `the Singoda AI API returned ${err.status}${err.code ? ` ${err.code}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}
