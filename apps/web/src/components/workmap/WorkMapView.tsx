"use client";

import type { WorkMap } from "@shadow/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Stat, StatGroup } from "../ui";
import { formatMs, OPEN_QUESTION_SLOT_LABEL } from "./format";
import { GuardrailList } from "./GuardrailList";
import { type LoadResult, loadWorkMap, patchWorkMap, publishWorkMap } from "./load";
import { Button, InlineConfirm, Pill } from "./primitives";
import { StepDetail } from "./StepDetail";
import { StepTimeline } from "./StepTimeline";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & LoadResult);

export type WorkMapViewProps = {
  /** Route id; "latest" resolves to the latest published map. */
  id: string;
  /** Session whose recording backs the clips. Clips are hidden when unknown. */
  sessionId: string | null;
  /** `?fixture=1`: show the sample map without calling the API. */
  forceFixture: boolean;
};

export function WorkMapView({ id, sessionId, forceFixture }: WorkMapViewProps) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<"idle" | "confirming" | "published">("idle");

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
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [id, forceFixture]);

  const map = state.status === "ready" ? state.map : null;
  const steps = useMemo(() => (map ? [...map.steps].sort((a, b) => a.order - b.order) : []), [map]);
  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? steps[0] ?? null;
  const isFixture = state.status === "ready" && state.source === "fixture";
  const canEdit = state.status === "ready" && !isFixture && publishState !== "published";

  const setMap = useCallback((next: WorkMap) => {
    setState((prev) => (prev.status === "ready" ? { ...prev, map: next } : prev));
  }, []);

  const removeStep = useCallback(
    async (stepId: string) => {
      if (!map) return;
      setActionError(null);
      setBusy(true);
      const optimistic: WorkMap = { ...map, steps: map.steps.filter((s) => s.id !== stepId) };
      setMap(optimistic);
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
      const optimistic: WorkMap = {
        ...map,
        guardrails: map.guardrails.filter((g) => g.id !== guardrailId),
        steps: map.steps.map((s) => ({
          ...s,
          guardrailIds: s.guardrailIds.filter((gid) => gid !== guardrailId),
        })),
      };
      setMap(optimistic);
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
      setPublishState("published");
    } catch (err: unknown) {
      setPublishState("idle");
      setActionError(err instanceof Error ? err.message : "Publishing failed.");
    } finally {
      setBusy(false);
    }
  }, [map]);

  if (state.status === "loading") {
    return (
      <main className={PAGE}>
        <p className="font-mono text-xs text-ink-faint">Work Map</p>
        <h1 className={TITLE}>Work Map</h1>
        <p className="mt-4 text-[1.0625rem] text-ink-muted" role="status">
          Loading map <span className="font-mono text-[0.9375rem]">{id}</span>…
        </p>
      </main>
    );
  }

  if (state.status === "error" || !map) {
    return (
      <main className={PAGE}>
        <h1 className={TITLE}>Work Map</h1>
        <p
          className="mt-6 max-w-[42rem] rounded-panel border border-danger/40 bg-danger-wash px-4 py-3 text-[0.9375rem] text-danger"
          role="alert"
        >
          {state.status === "error" ? state.message : "The map could not be shown."}
        </p>
        <p className="mt-4 max-w-[42rem] text-[0.9375rem] leading-relaxed text-ink-muted">
          Check that the API is running, or open{" "}
          <a
            className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            href={`/map/${encodeURIComponent(id)}?fixture=1`}
          >
            the sample map
          </a>{" "}
          to see the page with sample data.
        </p>
      </main>
    );
  }

  const judgmentCount = steps.filter((s) => s.judgmentCall).length;
  const coveragePct = Math.round(map.coverage * 100);
  const openQuestions = [...map.openQuestions].sort((a, b) => b.priority - a.priority);
  const confirmed = map.teachBackConfirmedAtMs;

  return (
    <main className={PAGE}>
      <header className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-8">
          <p className="font-mono text-xs text-ink-faint">Work Map, version {map.version}</p>
          <h1 className={TITLE}>{map.workflow}</h1>
          <p className="mt-5 max-w-[34rem] text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
            How {map.expertName} decides: {steps.length} steps, {judgmentCount} judgment calls,{" "}
            {map.guardrails.length} guardrails. Every one of them points at a screen moment and the
            expert's own words.
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:col-span-4 lg:items-end lg:pt-6">
          {isFixture && (
            <div className="flex max-w-[22rem] flex-col gap-1.5 rounded-panel border border-rule-strong bg-surface px-4 py-3 lg:items-end lg:text-right">
              <span className="inline-flex items-center gap-2 text-[0.9375rem] font-medium text-ink">
                <span aria-hidden="true" className="size-2 rounded-full bg-ink-muted" />
                <span>Sample data</span>
              </span>
              <span className="text-sm leading-snug text-ink-muted">
                {state.reason === "unreachable"
                  ? "The API is unreachable, so this is the sample map, not a recorded session."
                  : "This is the sample map, not a recorded session."}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {publishState === "published" ? (
              <Pill tone="good">Published</Pill>
            ) : publishState === "confirming" ? (
              <InlineConfirm
                message="Publish this map? The tutor and the guard will use it from now on."
                confirmLabel="Publish"
                busy={busy}
                onConfirm={publish}
                onCancel={() => setPublishState("idle")}
              />
            ) : (
              <Button
                tone="primary"
                onClick={() => setPublishState("confirming")}
                disabled={!canEdit || busy}
                title={isFixture ? "Publishing is disabled for sample data" : undefined}
              >
                Publish
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mt-12 border-t border-rule pt-10">
        <StatGroup>
          <Stat
            value={`${coveragePct}%`}
            label={
              <>
                <span className="block">of the expected judgment covered</span>
                <span
                  role="progressbar"
                  aria-valuenow={coveragePct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Coverage"
                  className="mt-3 block h-1 w-full max-w-[14rem] overflow-hidden rounded-pill bg-rule"
                >
                  <span
                    className="block h-full rounded-pill bg-ink"
                    style={{ width: `${coveragePct}%` }}
                  />
                </span>
              </>
            }
          />
          <Stat
            value={judgmentCount}
            label={`judgment calls across ${steps.length} steps`}
            note={`${map.guardrails.length} guardrails`}
          />
          <Stat
            value={confirmed === null ? "Open" : "Confirmed"}
            label={`Teach-back with ${map.expertName}`}
            note={
              confirmed === null
                ? `Not yet confirmed by ${map.expertName}`
                : `Confirmed at ${formatMs(confirmed)}`
            }
          />
        </StatGroup>
        <p className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.9375rem] text-ink-muted">
          <span className="text-ink">Off the record</span>
          {map.offRecordSpans.length === 0 ? (
            <span>Nothing was taken off the record.</span>
          ) : (
            <span>
              {map.offRecordSpans.length} span{map.offRecordSpans.length === 1 ? "" : "s"} (
              {map.offRecordSpans.map(([s, e], i) => (
                <span key={`${s}-${e}`}>
                  {i > 0 ? ", " : ""}
                  <span className="font-mono text-[0.8125rem] text-ink">
                    {formatMs(s)}–{formatMs(e)}
                  </span>
                </span>
              ))}
              ). Nothing from it is cited.
            </span>
          )}
        </p>

        {actionError && (
          <p
            role="alert"
            className="mt-6 rounded-panel border border-danger/40 bg-danger-wash px-4 py-3 text-[0.9375rem] text-danger"
          >
            {actionError}
          </p>
        )}
      </div>

      <div className="mt-14 grid gap-12 border-t border-rule pt-10 lg:grid-cols-12 lg:gap-10">
        <section aria-labelledby="steps-heading" className="lg:col-span-5">
          <h2 id="steps-heading" className={SECTION}>
            Steps
          </h2>
          <p className="mt-3 mb-6 max-w-[36ch] text-[0.9375rem] leading-relaxed text-ink-muted">
            In the order {map.expertName} worked. Select one to see its evidence.
          </p>
          {steps.length === 0 ? (
            <p className="text-[0.9375rem] text-ink-muted">
              Every step has been removed from this map.
            </p>
          ) : (
            <StepTimeline
              steps={steps}
              selectedId={selectedStep?.id ?? null}
              onSelect={setSelectedStepId}
            />
          )}
        </section>

        <section
          aria-label="Step detail"
          className="self-start rounded-panel border border-rule bg-surface p-5 sm:p-8 lg:sticky lg:top-6 lg:col-span-7"
        >
          {selectedStep ? (
            <StepDetail
              key={selectedStep.id}
              step={selectedStep}
              guardrails={map.guardrails}
              sessionId={sessionId}
              framesAvailable={!isFixture}
              canEdit={canEdit}
              busy={busy}
              onRemove={removeStep}
            />
          ) : (
            <p className="text-[0.9375rem] text-ink-muted">Select a step to see its evidence.</p>
          )}
        </section>
      </div>

      <div className="mt-16 border-t border-rule pt-10">
        <GuardrailList
          guardrails={map.guardrails}
          steps={steps}
          sessionId={sessionId}
          canEdit={canEdit}
          busy={busy}
          onRemove={removeGuardrail}
          onOpenStep={(stepId) => {
            setSelectedStepId(stepId);
            document
              .getElementById("steps-heading")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      </div>

      {openQuestions.length > 0 && (
        <section
          aria-labelledby="open-questions-heading"
          className="mt-16 grid gap-6 border-t border-rule pt-10 lg:grid-cols-12 lg:gap-10"
        >
          <div className="lg:col-span-5">
            <h2 id="open-questions-heading" className={SECTION}>
              Open questions{" "}
              <span className="font-mono text-base tracking-normal text-ink-faint">
                ({openQuestions.length})
              </span>
            </h2>
            <p className="mt-3 max-w-[36ch] text-[0.9375rem] leading-relaxed text-ink-muted">
              Gaps the debrief did not close. Nothing here is in the map until the expert answers
              it.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule lg:col-span-7">
            {openQuestions.map((q) => {
              const about = q.aboutStepId ? steps.find((s) => s.id === q.aboutStepId) : undefined;
              return (
                <li key={q.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Badge tone="muted">{OPEN_QUESTION_SLOT_LABEL[q.slot]}</Badge>
                    <span className="font-mono text-xs text-ink-faint">
                      priority {Math.round(q.priority * 100)}%
                    </span>
                    {about && (
                      <button
                        type="button"
                        onClick={() => setSelectedStepId(about.id)}
                        className="inline-flex min-h-10 items-center text-sm text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                      >
                        about step {about.order}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[1.0625rem] leading-relaxed text-ink">{q.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

const PAGE = "mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-6 lg:px-8";
const TITLE = "mt-3 max-w-[22ch] text-xl leading-tight font-semibold text-balance text-ink";
const SECTION = "text-lg leading-tight font-semibold text-ink";
