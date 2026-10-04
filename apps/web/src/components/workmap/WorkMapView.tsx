"use client";

import type { WorkMap } from "@shadow/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMs, OPEN_QUESTION_SLOT_LABEL } from "./format";
import { GuardrailList } from "./GuardrailList";
import { type LoadResult, loadWorkMap, patchWorkMap, publishWorkMap } from "./load";
import { Button, InlineConfirm, Pill, SectionTitle } from "./primitives";
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
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Work Map</h1>
        <p className="mt-2 text-neutral-500" role="status">
          Loading map {id}…
        </p>
      </main>
    );
  }

  if (state.status === "error" || !map) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Work Map</h1>
        <p className="mt-2 text-red-700 dark:text-red-300" role="alert">
          {state.status === "error" ? state.message : "The map could not be shown."}
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Check that the API is running, or open{" "}
          <a
            className="underline underline-offset-4"
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Work Map · version {map.version}</p>
            <h1 className="text-2xl font-semibold">{map.workflow}</h1>
            <p className="mt-1 text-neutral-500">
              How {map.expertName} decides: {steps.length} steps, {judgmentCount} judgment calls,{" "}
              {map.guardrails.length} guardrails. Every one of them points at a screen moment and
              the expert's own words.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isFixture && (
              <Pill tone="warn">
                Sample data
                {state.reason === "unreachable" ? " · API unreachable" : ""}
              </Pill>
            )}
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

        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Coverage
            </dt>
            <dd className="mt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums">{coveragePct}%</span>
                <span className="text-xs text-neutral-500">of the expected judgment covered</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={coveragePct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Coverage"
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
              >
                <div
                  className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100"
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
            </dd>
          </div>
          <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Teach-back
            </dt>
            <dd className="mt-1">
              {map.teachBackConfirmedAtMs === null ? (
                <Pill tone="warn">Not yet confirmed by {map.expertName}</Pill>
              ) : (
                <Pill tone="good">Confirmed at {formatMs(map.teachBackConfirmedAtMs)}</Pill>
              )}
            </dd>
          </div>
          <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Off the record
            </dt>
            <dd className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              {map.offRecordSpans.length === 0
                ? "Nothing was taken off the record."
                : `${map.offRecordSpans.length} span${map.offRecordSpans.length === 1 ? "" : "s"} (${map.offRecordSpans
                    .map(([s, e]) => `${formatMs(s)}–${formatMs(e)}`)
                    .join(", ")}). Nothing from it is cited.`}
            </dd>
          </div>
        </dl>

        {actionError && (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {actionError}
          </p>
        )}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="mb-3 text-lg font-semibold">
            Steps
          </h2>
          {steps.length === 0 ? (
            <p className="text-sm text-neutral-500">Every step has been removed from this map.</p>
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
          className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
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
            <p className="text-sm text-neutral-500">Select a step to see its evidence.</p>
          )}
        </section>
      </div>

      <div className="mt-12">
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
        <section aria-labelledby="open-questions-heading" className="mt-12">
          <h2 id="open-questions-heading" className="text-lg font-semibold">
            Open questions{" "}
            <span className="text-sm font-normal text-neutral-500">({openQuestions.length})</span>
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Gaps the debrief did not close. Nothing here is in the map until the expert answers it.
          </p>
          <ul className="mt-3 space-y-2">
            {openQuestions.map((q) => {
              const about = q.aboutStepId ? steps.find((s) => s.id === q.aboutStepId) : undefined;
              return (
                <li
                  key={q.id}
                  className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <SectionTitle>{OPEN_QUESTION_SLOT_LABEL[q.slot]}</SectionTitle>
                    <span>priority {Math.round(q.priority * 100)}%</span>
                    {about && (
                      <button
                        type="button"
                        onClick={() => setSelectedStepId(about.id)}
                        className="underline underline-offset-4"
                      >
                        about step {about.order}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{q.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
