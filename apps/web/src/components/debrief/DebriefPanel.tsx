"use client";

import Link from "next/link";
import { useEffect } from "react";
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
}

/**
 * Module 1, after End task: debrief questions, teach-back and prediction proof.
 * Specs: docs/tasks/tanbir.md TAN-7, TAN-8; docs/IMPLEMENTATION_PLAN.md §6.7.
 */
export function DebriefPanel({ onFinished, ...options }: DebriefPanelProps) {
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Debrief</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {phaseHint(view)}
          {!voice.connected && view.phase !== "idle" && view.phase !== "confirmed" && (
            <> Voice is not connected, so type your answers and use the buttons.</>
          )}
        </p>
      </header>

      {state.phase === "error" && (
        <div
          role="alert"
          className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          <p>{state.message}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={debrief.retry}
              className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white"
            >
              Try again
            </button>
            {state.canSkip && (
              <button
                type="button"
                onClick={debrief.skip}
                className="rounded-md border border-red-300 px-3 py-1.5 font-medium dark:border-red-800"
              >
                {state.op === "predictions" ? "Finish without it" : "Continue without it"}
              </button>
            )}
          </div>
        </div>
      )}

      {(view.phase === "idle" || view.phase === "ending") && (
        <p className="text-sm text-neutral-500">Building the draft Work Map…</p>
      )}

      {ctx && (
        <CoverageMeter coverage={ctx.coverage} answered={ctx.answeredIds.length} done={ctx.done} />
      )}

      {ctx && (view.phase === "asking" || ctx.questions.length > 0) && (
        <section aria-labelledby="questions-title" className="space-y-3">
          <h3 id="questions-title" className="text-sm font-medium">
            Open questions
          </h3>
          <OpenQuestionList
            questions={ctx.questions}
            answeredIds={ctx.answeredIds}
            currentId={view.phase === "asking" ? view.currentId : null}
          />
        </section>
      )}

      {view.phase === "asking" && (
        <AnswerBox
          key={view.currentId}
          label="Your answer to the highlighted question"
          submitLabel="Send answer"
          spokenCount={debrief.spoken.segmentIds.length}
          busy={view.submitting !== null || busy}
          voiceConnected={voice.connected}
          onSubmitSpoken={debrief.submitSpoken}
          onSubmitTyped={debrief.submitTyped}
        />
      )}

      {(view.phase === "teachback" || view.phase === "correcting") && (
        <TeachBackCard
          text={view.text}
          recheck={view.recheck}
          round={view.round}
          maxRounds={MAX_CORRECTION_ROUNDS}
          mode={view.phase === "correcting" ? "correcting" : "reading"}
          busy={busy || (view.phase === "teachback" ? view.confirming : view.submitting !== null)}
          onConfirm={debrief.confirm}
          onCorrect={debrief.correct}
          onCancelCorrection={debrief.cancelCorrection}
          correction={
            view.phase === "correcting" ? (
              <AnswerBox
                label="What did Shadow get wrong?"
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
        <section className="flex flex-wrap items-center gap-3">
          <ConfirmedBadge confirmedAtMs={view.ctx.teachBackConfirmedAtMs} />
          <Link
            href={`/map/${encodeURIComponent(view.ctx.workMapId)}?session=${encodeURIComponent(sessionId)}`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Open the Work Map
          </Link>
        </section>
      )}
    </div>
  );
}

function phaseHint(state: DebriefState): string {
  switch (state.phase) {
    case "idle":
    case "ending":
      return "Shadow is turning what it saw into a draft map.";
    case "asking":
      return "Shadow asks what it could not learn by watching, one question at a time.";
    case "teachback":
    case "correcting":
      return "Shadow explains the workflow back to you. Confirm it or correct what is wrong.";
    case "predicting":
      return "Shadow predicts tickets it has not seen. Mark each prediction right or wrong.";
    case "confirmed":
      return "The debrief is complete.";
    case "error":
      return phaseHint(state.resume);
  }
}
