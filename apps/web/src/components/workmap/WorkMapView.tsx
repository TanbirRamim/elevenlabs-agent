"use client";

import type { WorkMap } from "@shadow/schema";
import {
  Bot,
  CircleDot,
  CircleHelp,
  Download,
  EyeOff,
  FileQuestion,
  Link2,
  Map as MapIcon,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { publicEnv } from "../../env";
import { ApiClientError } from "../../lib/api";
import { Page } from "../shell/Page";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  IconButton,
  Kbd,
  Meter,
  PageHeader,
  Panel,
  Skeleton,
  SkeletonText,
  Stat,
  StatGroup,
  StatusPill,
  useToast,
} from "../ui";
import { formatMs, OPEN_QUESTION_SLOT_LABEL } from "./format";
import { GuardrailList } from "./GuardrailList";
import { type LoadResult, loadWorkMap, patchWorkMap, publishWorkMap } from "./load";
import { SessionRibbon } from "./SessionRibbon";
import { StepDetail } from "./StepDetail";
import { StepTimeline } from "./StepTimeline";

/** Where "Start a capture session" goes (mirrors START_CAPTURE_HREF in the shell). */
const CAPTURE_HREF = "/capture?intent=start";
const SAMPLE_HREF = "/map/latest?fixture=1";

type ViewState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & LoadResult);

export type WorkMapViewProps = {
  /** Route id; "latest" resolves to the latest published map. */
  id: string;
  /** Session whose recording backs the clips. Falls back to the map's source session. */
  sessionId: string | null;
  /** `?fixture=1`: show the sample map without calling the API. */
  forceFixture: boolean;
  /** Shown in the "API did not answer" notice. */
  apiUrl?: string;
};

export function WorkMapView({
  id,
  sessionId,
  forceFixture,
  apiUrl = publicEnv.apiUrl,
}: WorkMapViewProps) {
  const toast = useToast();
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishedNow, setPublishedNow] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadWorkMap(id, { forceFixture })
      .then((result) => {
        if (cancelled) return;
        setState({ status: "ready", ...result });
        const first = [...result.map.steps].sort((a, b) => a.order - b.order)[0];
        setSelectedStepId(first ? first.id : null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.kind === "http" && err.status === 404) {
          setState({ status: "not_found" });
          return;
        }
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [id, forceFixture, attempt]);

  const map = state.status === "ready" ? state.map : null;
  const steps = useMemo(() => (map ? [...map.steps].sort((a, b) => a.order - b.order) : []), [map]);
  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? steps[0] ?? null;
  const isFixture = state.status === "ready" && state.source === "fixture";
  const isPublished = (state.status === "ready" && !isFixture && id === "latest") || publishedNow;
  const canEdit = state.status === "ready" && !isFixture && !isPublished;
  const clipSession = sessionId ?? map?.sourceSessionId ?? null;
  /** No source session: sample data, whether the API served it or the bundled fixture. */
  const isSample = map !== null && !map.sourceSessionId;

  /** Selects a step; on one-column layouts (or when asked) brings its evidence into view. */
  const selectStep = useCallback((stepId: string, reveal = false, fromKey = false) => {
    setSelectedStepId(stepId);
    const wide = window.matchMedia?.("(min-width: 1024px)").matches ?? true;
    if (fromKey || (!reveal && wide)) return;
    requestAnimationFrame(() =>
      document
        .getElementById("step-detail")
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
    );
  }, []);

  const setMap = useCallback((next: WorkMap) => {
    setState((prev) => (prev.status === "ready" ? { ...prev, map: next } : prev));
  }, []);

  const removeStep = useCallback(
    async (stepId: string) => {
      if (!map) return;
      setActionError(null);
      setBusy(true);
      setMap({ ...map, steps: map.steps.filter((s) => s.id !== stepId) });
      try {
        setMap(await patchWorkMap(map.id, { deleteStepIds: [stepId] }));
      } catch (err: unknown) {
        setMap(map);
        setActionError(err instanceof Error ? err.message : "Removing the step failed.");
      } finally {
        setBusy(false);
      }
    },
    [map, setMap],
  );

  const removeGuardrail = useCallback(
    async (guardrailId: string) => {
      if (!map) return;
      setActionError(null);
      setBusy(true);
      setMap({
        ...map,
        guardrails: map.guardrails.filter((g) => g.id !== guardrailId),
        steps: map.steps.map((s) => ({
          ...s,
          guardrailIds: s.guardrailIds.filter((gid) => gid !== guardrailId),
        })),
      });
      try {
        setMap(await patchWorkMap(map.id, { deleteGuardrailIds: [guardrailId] }));
      } catch (err: unknown) {
        setMap(map);
        setActionError(err instanceof Error ? err.message : "Removing the guardrail failed.");
      } finally {
        setBusy(false);
      }
    },
    [map, setMap],
  );

  const publish = useCallback(async () => {
    if (!map) return;
    setActionError(null);
    setBusy(true);
    try {
      await publishWorkMap(map.id);
      setPublishedNow(true);
      setConfirmPublish(false);
      toast.toast({
        title: "Work Map published",
        description: "Teach and the Copilot use this version from now on.",
        tone: "ok",
      });
    } catch (err: unknown) {
      setConfirmPublish(false);
      setActionError(err instanceof Error ? err.message : "Publishing failed.");
    } finally {
      setBusy(false);
    }
  }, [map, toast]);

  const exportJson = useCallback(() => {
    if (!map) return;
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${map.id}-v${map.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [map]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.toast({ title: "Link copied", tone: "ok" });
    } catch {
      toast.toast({ title: "Could not copy the link", tone: "danger" });
    }
  }, [toast]);

  if (state.status === "loading") return <LoadingView id={id} />;

  if (state.status === "not_found") {
    return (
      <Page width="wide">
        <PageHeader title="Work Map" />
        {id === "latest" ? (
          <EmptyState
            size="page"
            icon={<MapIcon />}
            title="No Work Map is published yet"
            description="A Work Map is built from a capture session: the expert works real tickets, Singoda AI asks why at the pauses, and the debrief closes the gaps. Publish it from here when the expert has confirmed the teach-back."
            action={
              <>
                <ButtonLink href={CAPTURE_HREF} icon={<CircleDot aria-hidden="true" />}>
                  Start a capture session
                </ButtonLink>
                <ButtonLink href={SAMPLE_HREF} variant="secondary">
                  Open the sample Work Map
                </ButtonLink>
              </>
            }
          />
        ) : (
          <EmptyState
            size="page"
            icon={<FileQuestion />}
            title="This Work Map does not exist"
            description={
              <>
                The API has no map with id <span className="font-mono text-ink">{id}</span>. It may
                have been replaced by a newer draft.
              </>
            }
            action={
              <>
                <ButtonLink href="/map/latest">Open the published map</ButtonLink>
                <ButtonLink href={SAMPLE_HREF} variant="secondary">
                  Open the sample Work Map
                </ButtonLink>
              </>
            }
          />
        )}
      </Page>
    );
  }

  if (state.status === "error" || !map) {
    return (
      <Page width="wide">
        <PageHeader title="Work Map" className="mb-6" />
        <Alert
          tone="danger"
          title="The Work Map could not be loaded"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
              <ButtonLink size="sm" variant="ghost" href={SAMPLE_HREF}>
                Open the sample map
              </ButtonLink>
            </div>
          }
        >
          {state.status === "error" ? state.message : "The map could not be shown."}
        </Alert>
      </Page>
    );
  }

  const judgmentCount = steps.filter((s) => s.judgmentCall).length;
  const coveragePct = Math.round(map.coverage * 100);
  const openQuestions = [...map.openQuestions].sort((a, b) => b.priority - a.priority);
  const confirmed = map.teachBackConfirmedAtMs;
  const hardRules = map.guardrails.filter(
    (g) => g.type === "never" || g.type === "stop_and_ask",
  ).length;
  const copilotHref = isFixture || id === "latest" ? "/copilot" : `/copilot?map=${map.id}`;

  return (
    <Page width="wide">
      <PageHeader
        meta={
          <>
            {isFixture ? (
              <StatusPill tone="muted">Sample data</StatusPill>
            ) : isPublished ? (
              <StatusPill tone="ok">Published</StatusPill>
            ) : (
              <StatusPill tone="neutral">Draft</StatusPill>
            )}
            {isSample && !isFixture ? <Badge tone="muted">Sample Work Map</Badge> : null}
            <Badge tone="muted" className="figures font-mono">
              v{map.version}
            </Badge>
            <span className="text-xs text-ink-faint">
              {map.sourceSessionId ? (
                <>
                  From session <span className="font-mono">{map.sourceSessionId}</span>
                </>
              ) : (
                "Not from a recorded session"
              )}
            </span>
          </>
        }
        title={map.workflow}
        description={`How ${map.expertName} decides, in ${steps.length} steps. Every step and rule points at a screen moment and ${map.expertName}’s own words.`}
        actions={
          <>
            <IconButton label="Copy link" variant="ghost" onClick={copyLink}>
              <Link2 />
            </IconButton>
            <Button variant="secondary" icon={<Download aria-hidden="true" />} onClick={exportJson}>
              Export
            </Button>
            <ButtonLink href={copilotHref} variant="secondary" icon={<Bot aria-hidden="true" />}>
              Open in Copilot
            </ButtonLink>
            {isPublished && !isFixture ? null : (
              <Button
                icon={<Upload aria-hidden="true" />}
                onClick={() => setConfirmPublish(true)}
                disabled={!canEdit || busy}
                title={isFixture ? "Publishing is disabled for sample data" : undefined}
              >
                Publish
              </Button>
            )}
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-3">
        {/* The offline alert below already says the sample is standing in for the API. */}
        {isSample &&
        !(
          state.status === "ready" &&
          state.source === "fixture" &&
          state.reason === "unreachable"
        ) ? (
          <Alert tone="info" title="Sample Work Map">
            Built from sample data, not from a recorded session. Record a live capture and the Work
            Map built from it replaces this one.
          </Alert>
        ) : null}
        {isFixture && state.status === "ready" && state.reason === "unreachable" ? (
          <Alert
            tone="offline"
            title={`The API at ${apiUrl} did not answer`}
            action={
              <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            }
          >
            Showing the sample map instead of a recorded session. Start the API with{" "}
            <code className="font-mono text-xs text-ink">pnpm dev</code>, then try again.
          </Alert>
        ) : null}
        {actionError ? (
          <Alert tone="danger" title="That change was not saved">
            {actionError}
          </Alert>
        ) : null}
      </div>

      <StatGroup className="mt-6">
        <Stat label="Steps" value={steps.length} note="in the order they were worked" />
        <Stat
          label="Judgment calls"
          value={judgmentCount}
          unit={`/ ${steps.length}`}
          note="steps decided case by case"
        />
        <Stat
          label="Guardrails"
          value={map.guardrails.length}
          note={`${hardRules} stop or never rules`}
        />
        <Stat
          label="Coverage"
          value={`${coveragePct}%`}
          note={
            <Meter
              value={map.coverage}
              label="Coverage of the expected judgment"
              valueText={`${coveragePct}%`}
              className="mt-1"
            />
          }
        />
        <Stat
          label={`Teach-back with ${map.expertName}`}
          value={confirmed === null ? "Open" : "Confirmed"}
          note={
            confirmed === null
              ? `Not yet confirmed by ${map.expertName}`
              : `Confirmed at ${formatMs(confirmed)}`
          }
        />
      </StatGroup>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        <EyeOff aria-hidden="true" className="size-3.5 stroke-[1.75] text-ink-faint" />
        <span className="font-medium text-ink">Off the record:</span>
        {map.offRecordSpans.length === 0 ? (
          <span>nothing was taken off the record.</span>
        ) : (
          <span>
            {map.offRecordSpans.map(([s, e], i) => (
              <span key={`${s}-${e}`}>
                {i > 0 ? ", " : ""}
                <span className="figures font-mono text-ink">
                  {formatMs(s)}–{formatMs(e)}
                </span>
              </span>
            ))}
            . Nothing from {map.offRecordSpans.length === 1 ? "that span" : "those spans"} is
            transcribed or cited.
          </span>
        )}
      </p>

      <div className="mt-6">
        <SessionRibbon
          map={map}
          selectedId={selectedStep?.id ?? null}
          onSelect={(stepId) => selectStep(stepId)}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel
          title="Steps"
          meta={
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>to move</span>
            </span>
          }
          flush
        >
          {steps.length === 0 ? (
            <div className="px-4">
              <EmptyState
                title="No steps left"
                description="Every step has been removed from this map."
              />
            </div>
          ) : (
            <StepTimeline
              steps={steps}
              selectedId={selectedStep?.id ?? null}
              onSelect={(stepId, source) => selectStep(stepId, false, source === "key")}
            />
          )}
        </Panel>

        <section
          id="step-detail"
          aria-label="Step detail"
          className="overflow-hidden rounded-panel border border-rule bg-surface lg:sticky lg:top-16"
        >
          {selectedStep ? (
            <StepDetail
              key={selectedStep.id}
              step={selectedStep}
              stepCount={steps.length}
              expertName={map.expertName}
              guardrails={map.guardrails}
              sessionId={clipSession}
              canEdit={canEdit}
              busy={busy}
              onRemove={removeStep}
            />
          ) : (
            <p className="p-4 text-ui text-ink-muted">Select a step to see its evidence.</p>
          )}
        </section>
      </div>

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <GuardrailList
          guardrails={map.guardrails}
          steps={steps}
          sessionId={clipSession}
          expertName={map.expertName}
          canEdit={canEdit}
          busy={busy}
          onRemove={removeGuardrail}
          onOpenStep={(stepId) => selectStep(stepId, true)}
        />

        <Panel
          id="open-questions"
          title="Open questions"
          meta={`${openQuestions.length} unverified`}
          flush
        >
          {openQuestions.length === 0 ? (
            <div className="px-4">
              <EmptyState
                icon={<CircleHelp />}
                title="No open questions"
                description={`The debrief closed every gap Singoda AI found. Nothing in this map is unverified.`}
              />
            </div>
          ) : (
            <>
              <p className="border-b border-rule px-4 py-2.5 text-xs text-ink-muted">
                Singoda AI asked, {map.expertName} has not answered yet. None of this is in the map.
              </p>
              <ul aria-label="Open questions" className="divide-y divide-rule">
                {openQuestions.map((q) => {
                  const about = q.aboutStepId
                    ? steps.find((s) => s.id === q.aboutStepId)
                    : undefined;
                  return (
                    <li key={q.id} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="muted" icon={<CircleHelp aria-hidden="true" />}>
                          Unverified
                        </Badge>
                        <Badge tone="neutral">{OPEN_QUESTION_SLOT_LABEL[q.slot]}</Badge>
                        {about ? (
                          <button
                            type="button"
                            onClick={() => selectStep(about.id, true)}
                            className="ml-auto rounded-control px-1 text-xs text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink hover:decoration-ink"
                          >
                            About step {about.order}
                          </button>
                        ) : null}
                      </div>
                      <p className="text-ui text-ink">{q.text}</p>
                      <Meter
                        value={q.priority}
                        label={`Priority of question ${q.id}`}
                        valueText={`${Math.round(q.priority * 100)}%`}
                        caption={`priority ${Math.round(q.priority * 100)}%`}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <Dialog
        open={confirmPublish}
        onOpenChange={(open) => !busy && setConfirmPublish(open)}
        title="Publish this Work Map?"
        description={`Teach and the Copilot will use version ${map.version} from now on. ${map.expertName}'s quotes stay attached to every rule.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPublish(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={publish} loading={busy}>
              Publish version {map.version}
            </Button>
          </>
        }
      />
    </Page>
  );
}

function LoadingView({ id }: { id: string }) {
  return (
    <Page width="wide">
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading Work Map {id}</span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-rule bg-rule lg:grid-cols-5">
          {["a", "b", "c", "d", "e"].map((k) => (
            <div key={k} className="flex flex-col gap-2 bg-surface px-4 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-4">
            {["1", "2", "3", "4"].map((k) => (
              <div key={k} className="grid grid-cols-[3rem_1.5rem_1fr] gap-2.5">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="size-6 rounded-full" />
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-4">
            <SkeletonText lines={3} />
            <Skeleton className="aspect-video w-full rounded-panel" />
          </div>
        </div>
      </div>
    </Page>
  );
}
