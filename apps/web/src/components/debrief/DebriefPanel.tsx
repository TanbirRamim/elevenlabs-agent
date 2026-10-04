"use client";

import { useEffect } from "react";
import { Notice } from "../session/Notice";
import { Button, ButtonLink } from "../ui";
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
    <div className="flex flex-col gap-8">
      <header className="max-w-[40rem]">
        <h2 className="font-display text-[2rem] leading-[1.1] font-normal tracking-[-0.015em] text-ink">
          Debrief
        </h2>
        <p className="mt-2 text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
          {phaseHint(view)}
          {!voice.connected && view.phase !== "idle" && view.phase !== "confirmed" && (
            <> Voice is not connected, so type your answers and use the buttons.</>
          )}
        </p>
      </header>

      {state.phase === "error" && (
        <Notice
          role="alert"
          actions={
            <>
              <Button size="sm" onClick={debrief.retry}>
                Try again
              </Button>
              {state.canSkip && (
                <Button size="sm" variant="secondary" onClick={debrief.skip}>
                  {state.op === "predictions" ? "Finish without it" : "Continue without it"}
                </Button>
              )}
            </>
          }
        >
          <p>{state.message}</p>
        </Notice>
      )}

      {(view.phase === "idle" || view.phase === "ending") && (
        <p aria-live="polite" className="text-[0.9375rem] text-ink-faint">
          Building the draft Work Map…
        </p>
      )}

      {ctx && (
        <CoverageMeter coverage={ctx.coverage} answered={ctx.answeredIds.length} done={ctx.done} />
      )}

      {ctx && (view.phase === "asking" || ctx.questions.length > 0) && (
        <section aria-labelledby="questions-title" className="flex flex-col gap-3">
          <h3 id="questions-title" className="text-sm font-medium text-ink-muted">
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
        <section className="flex flex-col gap-4 border-t border-rule pt-6 sm:flex-row sm:items-center sm:justify-between">
          <ConfirmedBadge confirmedAtMs={view.ctx.teachBackConfirmedAtMs} />
          <ButtonLink
            href={`/map/${encodeURIComponent(view.ctx.workMapId)}?session=${encodeURIComponent(sessionId)}`}
          >
            Open the Work Map
          </ButtonLink>
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
