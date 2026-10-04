"use client";

import { ArrowRight, Check, Minus, X } from "lucide-react";
import { useEffect } from "react";
import { type ProcessingStep, ProcessingSteps } from "../recording";
import { Alert, Badge, Button, ButtonLink, cx, SkeletonText } from "../ui";
import { AnswerBox } from "./AnswerBox";
import { ConfirmedBadge } from "./ConfirmedBadge";
import { CoverageMeter } from "./CoverageMeter";
import { currentVariant, type DebriefState, MAX_CORRECTION_ROUNDS } from "./machine";
import { OpenQuestionList } from "./OpenQuestionList";
import { PredictionCheck } from "./PredictionCheck";
import { TeachBackCard } from "./TeachBackCard";
import { type DebriefVoice, type UseDebriefOptions, useDebrief } from "./useDebrief";

export interface DebriefPanelProps extends Omit<UseDebriefOptions, "voice"> {
  voice: DebriefVoice;
  /** Called once when the debrief reaches its end. */
  onFinished?: (state: Extract<DebriefState, { phase: "confirmed" }>) => void;
  /**
   * The capture pipeline's steps so far (recording, redaction, upload). The debrief adds the
   * Work Map draft, which is its own first call.
   */
  processing?: readonly ProcessingStep[];
}

const STAGES = ["Questions", "Teach-back", "Predictions", "Done"] as const;

function stageIndex(state: DebriefState): number {
  switch (state.phase) {
    case "idle":
    case "ending":
      return -1;
    case "asking":
      return 0;
    case "teachback":
    case "correcting":
      return 1;
    case "predicting":
      return 2;
    case "confirmed":
      return 3;
    case "error":
      return stageIndex(state.resume);
  }
}

/**
 * Module 1, after Stop: the conversation with Singoda AI about what it could not see, its
 * teach-back, and the prediction proof.
 * Spec: docs/IMPLEMENTATION_PLAN.md §6.7.
 */
export function DebriefPanel({ onFinished, processing, ...options }: DebriefPanelProps) {
  const debrief = useDebrief(options);
  const { state, start } = debrief;
  const { voice, sessionId } = options;

  useEffect(() => start(), [start]);

  useEffect(() => {
    if (state.phase === "confirmed") onFinished?.(state);
  }, [state, onFinished]);

  const view = state.phase === "error" ? state.resume : state;
  const ctx = "ctx" in view ? view.ctx : null;
  const busy = state.phase === "error";
  const endFailed = state.phase === "error" && state.op === "end";
  const building = view.phase === "idle" || view.phase === "ending" || endFailed;

  const workmapStep: ProcessingStep = {
    id: "workmap",
    label: "Draft the Work Map",
    status: endFailed ? "failed" : building ? "running" : "done",
    detail: endFailed
      ? "See the error above."
      : building
        ? "Singoda AI turns what it saw into a draft map and finds what it could not learn by watching."
        : undefined,
  };
  const steps = [...(processing ?? []), workmapStep];

  return (
    <div className="flex flex-col gap-4">
      {building ? (
        <ProcessingSteps title="Processing the session" steps={steps} />
      ) : processing ? (
        <ProcessedSummary steps={steps} />
      ) : null}

      <section aria-labelledby="debrief-title" className="flex flex-col gap-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 id="debrief-title" className="text-sm font-semibold text-ink">
              Debrief with Singoda AI
            </h2>
            <p className="mt-0.5 max-w-prose text-ui text-pretty text-ink-muted">
              {phaseHint(view)}
              {!voice.connected && view.phase !== "idle" && view.phase !== "confirmed" && (
                <> Voice is not connected, so type your answers and use the buttons.</>
              )}
            </p>
          </div>
          <Stepper current={stageIndex(state)} />
        </header>

        {state.phase === "error" && (
          <Alert
            tone="danger"
            title="Singoda AI could not continue the debrief"
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={debrief.retry}>
                  Try again
                </Button>
                {state.canSkip && (
                  <Button size="sm" variant="ghost" onClick={debrief.skip}>
                    {state.op === "predictions" ? "Finish without it" : "Continue without it"}
                  </Button>
                )}
              </div>
            }
          >
            {state.message}
          </Alert>
        )}

        {building && !endFailed ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-2">
            <p className="text-ui text-ink-faint">Building the draft Work Map…</p>
            <SkeletonText lines={3} className="max-w-xl" />
          </div>
        ) : null}

        {ctx ? (
          <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_16rem]">
            <aside
              aria-label="Debrief progress"
              className="rounded-panel border border-rule bg-surface p-4 2xl:order-last"
            >
              <CoverageMeter
                coverage={ctx.coverage}
                answered={ctx.answeredIds.length}
                done={ctx.done}
              />
            </aside>
            <div className="flex min-w-0 flex-col gap-4">
              {(view.phase === "asking" || ctx.questions.length > 0) && (
                <section aria-labelledby="questions-title" className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id="questions-title" className="text-ui font-semibold text-ink">
                      Open questions
                    </h3>
                    <span className="figures text-xs text-ink-faint">
                      {ctx.answeredIds.length} of {ctx.questions.length} answered
                    </span>
                  </div>
                  <OpenQuestionList
                    questions={ctx.questions}
                    answeredIds={ctx.answeredIds}
                    currentId={view.phase === "asking" ? view.currentId : null}
                    answer={
                      view.phase === "asking" ? (
                        <AnswerBox
                          key={view.currentId}
                          label="Your answer"
                          submitLabel="Send answer"
                          spokenCount={debrief.spoken.segmentIds.length}
                          busy={view.submitting !== null || busy}
                          voiceConnected={voice.connected}
                          onSubmitSpoken={debrief.submitSpoken}
                          onSubmitTyped={debrief.submitTyped}
                        />
                      ) : undefined
                    }
                  />
                </section>
              )}

              {(view.phase === "teachback" || view.phase === "correcting") && (
                <TeachBackCard
                  text={view.text}
                  recheck={view.recheck}
                  round={view.round}
                  maxRounds={MAX_CORRECTION_ROUNDS}
                  mode={view.phase === "correcting" ? "correcting" : "reading"}
                  busy={
                    busy ||
                    (view.phase === "teachback" ? view.confirming : view.submitting !== null)
                  }
                  onConfirm={debrief.confirm}
                  onCorrect={debrief.correct}
                  onCancelCorrection={debrief.cancelCorrection}
                  correction={
                    view.phase === "correcting" ? (
                      <AnswerBox
                        label="What did Singoda AI get wrong?"
                        submitLabel="Send correction"
                        spokenCount={debrief.spoken.segmentIds.length}
                        busy={view.submitting !== null || busy}
                        voiceConnected={voice.connected}
                        onSubmitSpoken={debrief.submitSpoken}
                        onSubmitTyped={debrief.submitTyped}
                      />
                    ) : undefined
                  }
                />
              )}

              {(view.phase === "predicting" ||
                (view.phase === "confirmed" && view.variants.length > 0)) && (
                <PredictionCheck
                  variants={view.variants}
                  marks={view.marks}
                  currentId={
                    view.phase === "predicting"
                      ? (currentVariant(view.variants, view.marks)?.id ?? null)
                      : null
                  }
                  stepTitle={(id) => view.ctx.workMap?.steps.find((s) => s.id === id)?.title}
                  onMark={debrief.mark}
                  readOnly={view.phase === "confirmed" || busy}
                />
              )}

              {view.phase === "confirmed" && (
                <section
                  aria-label="Debrief complete"
                  className="flex flex-col gap-3 rounded-panel border border-rule bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-2 text-ui text-ink-muted">
                    <ConfirmedBadge confirmedAtMs={view.ctx.teachBackConfirmedAtMs} />
                    <span>The draft Work Map is saved with this session.</span>
                  </div>
                  <ButtonLink
                    href={`/map/${encodeURIComponent(view.ctx.workMapId)}?session=${encodeURIComponent(sessionId)}`}
                  >
                    Open the Work Map
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </ButtonLink>
                </section>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol aria-label="Debrief steps" className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1">
      {STAGES.map((label, i) => {
        const done = i < current || (i === current && i === STAGES.length - 1);
        const now = i === current && !done;
        return (
          <li
            key={label}
            aria-current={now ? "step" : undefined}
            className="flex items-center gap-1 text-xs"
          >
            {i > 0 ? <span aria-hidden="true" className="h-px w-3 bg-rule-strong" /> : null}
            <span
              className={cx(
                "inline-flex h-6 items-center gap-1 rounded-pill border px-2",
                now
                  ? "border-transparent bg-ask-wash font-medium text-ask-text"
                  : done
                    ? "border-rule text-ink-muted"
                    : "border-rule text-ink-faint",
              )}
            >
              {done ? <Check aria-hidden="true" className="size-3 stroke-2 text-ok" /> : null}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const SHORT: Record<string, string> = {
  recording: "Recording",
  redaction: "Redaction",
  upload: "Upload",
  workmap: "Work Map draft",
};

/** After processing: one quiet row that keeps the outcome of each step in view. */
function ProcessedSummary({ steps }: { steps: readonly ProcessingStep[] }) {
  return (
    <section
      aria-label="Session processing"
      className="flex flex-wrap items-center gap-2 rounded-panel border border-rule bg-sunken px-3 py-2"
    >
      <span className="text-xs font-medium text-ink-muted">Session processed</span>
      {steps.map((s) => {
        const name = SHORT[s.id] ?? s.label;
        if (s.status === "done")
          return (
            <Badge key={s.id} tone="ok" icon={<Check aria-hidden="true" />}>
              {name}
            </Badge>
          );
        if (s.status === "failed")
          return (
            <Badge key={s.id} tone="danger" icon={<X aria-hidden="true" />}>
              {name} failed
            </Badge>
          );
        return (
          <Badge key={s.id} tone="muted" icon={<Minus aria-hidden="true" />}>
            {name} {s.status === "skipped" ? "skipped" : "waiting"}
          </Badge>
        );
      })}
    </section>
  );
}

function phaseHint(state: DebriefState): string {
  switch (state.phase) {
    case "idle":
    case "ending":
      return "Singoda AI is turning what it saw into a draft map.";
    case "asking":
      return "Singoda AI asks what it could not learn by watching, one question at a time.";
    case "teachback":
    case "correcting":
      return "Singoda AI explains the workflow back to you. Confirm it or correct what is wrong.";
    case "predicting":
      return "Singoda AI predicts tickets it has not seen. Mark each prediction right or wrong.";
    case "confirmed":
      return "The debrief is complete.";
    case "error":
      return phaseHint(state.resume);
  }
}
