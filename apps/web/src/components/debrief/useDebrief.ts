"use client";

import type { OpenQuestion } from "@shadow/schema";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { type ApiClient, ApiClientError, api } from "../../lib/api";
import {
  canCorrect,
  currentVariant,
  type DebriefOp,
  type DebriefState,
  debriefReducer,
  initialDebriefState,
  type PredictionMark,
  pendingOp,
} from "./machine";
import {
  type CollectedAnswer,
  collectAnswer,
  type DebriefLine,
  firstConfirmation,
  predictionSentence,
} from "./speech";

/** What the debrief needs from the voice session. Works with no live voice at all. */
export interface DebriefVoice {
  connected: boolean;
  transcript: readonly DebriefLine[];
  /** Sends a hidden control message; returns false when there is no live session. */
  speak(prefix: "[DEBRIEF]" | "[TEACHBACK]", payload: string | object): boolean;
}

export type DebriefApi = Pick<
  ApiClient,
  "endSession" | "answerDebrief" | "requestTeachBack" | "confirmTeachBack" | "getPredictionVariants"
>;

export interface UseDebriefOptions {
  sessionId: string;
  voice: DebriefVoice;
  /** Session clock (ms since the session started). */
  clock: () => number;
  /** True for transcript lines that were sent to the API (only those can be cited). */
  isSent: (segmentId: string) => boolean;
  /** Sends a typed answer as an expert transcript segment; returns its id, or null if it was not sent. */
  sendTypedLine: (text: string) => string | null;
  client?: DebriefApi;
}

export interface Debrief {
  state: DebriefState;
  /** The expert's spoken answer so far for the current question or correction. */
  spoken: CollectedAnswer;
  start(): void;
  submitSpoken(): void;
  submitTyped(text: string): boolean;
  confirm(): void;
  correct(): void;
  cancelCorrection(): void;
  mark(variantId: string, mark: PredictionMark): void;
  retry(): void;
  skip(): void;
}

const OP_LABEL: Record<DebriefOp, string> = {
  end: "building the draft map",
  answer: "saving your answer",
  teachback: "preparing the teach-back",
  confirm: "saving the teach-back",
  predictions: "preparing the prediction check",
};

/** Human-readable reason a debrief call failed. */
export function describeDebriefError(op: DebriefOp, err: unknown): string {
  if (err instanceof ApiClientError) {
    const code = err.code ? `, ${err.code}` : "";
    if (err.kind === "network") return `The Shadow API is not reachable while ${OP_LABEL[op]}.`;
    if (err.kind === "invalid_response")
      return `The API sent an unexpected response while ${OP_LABEL[op]}.`;
    if (err.status === 404 || err.status === 405 || err.status === 501)
      return `This API does not serve ${err.method} ${err.path} (${err.status}${code}), so Shadow cannot finish ${OP_LABEL[op]}.`;
    return `The API returned an error while ${OP_LABEL[op]} (${err.status}${code}).`;
  }
  return err instanceof Error ? err.message : String(err);
}

function forAgent(questions: readonly OpenQuestion[]) {
  return { questions: questions.map(({ id, slot, text }) => ({ id, slot, text })) };
}

/**
 * Runs the debrief: performs the API call each state waits for, tells the voice agent what
 * to say, and turns the expert's spoken answers (or typed ones, without voice) into events.
 */
export function useDebrief({
  sessionId,
  voice,
  clock,
  isSent,
  sendTypedLine,
  client = api,
}: UseDebriefOptions): Debrief {
  const [state, dispatch] = useReducer(debriefReducer, initialDebriefState);

  // Latest values for async callbacks.
  const transcript = useRef(voice.transcript);
  transcript.current = voice.transcript;
  const speak = useRef(voice.speak);
  speak.current = voice.speak;
  const sentFilter = useRef(isSent);
  sentFilter.current = isSent;
  const eligible = useCallback((id: string) => sentFilter.current(id), []);

  /** Transcript index where the expert's current answer starts. */
  const since = useRef(0);
  /** The expert's next answer starts after everything said so far. */
  const markSince = useCallback(() => {
    since.current = transcript.current.length;
  }, []);
  /** Questions the agent has already been given. */
  const told = useRef(new Set<string>());

  // Perform the API call the current state waits for, once per state object.
  const inflight = useRef<DebriefState | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const op = pendingOp(state);
    if (!op || inflight.current === state) return;
    inflight.current = state;
    const fail = (err: unknown) => {
      if (alive.current) dispatch({ type: "FAILED", op, message: describeDebriefError(op, err) });
    };

    (async () => {
      switch (op) {
        case "end": {
          const result = await client.endSession(sessionId);
          if (!alive.current) return;
          dispatch({ type: "END_OK", result });
          if (result.openQuestions.length > 0) {
            const ordered = [...result.openQuestions].sort((a, b) => b.priority - a.priority);
            for (const q of ordered) told.current.add(q.id);
            speak.current("[DEBRIEF]", forAgent(ordered));
          }
          markSince();
          return;
        }
        case "answer": {
          if (state.phase !== "asking" || !state.submitting) return;
          const status = await client.answerDebrief(sessionId, {
            questionId: state.currentId,
            segmentIds: state.submitting,
          });
          if (!alive.current) return;
          dispatch({ type: "ANSWER_OK", status });
          // A rebuild can add questions the agent has not heard yet: hand it the rest.
          const fresh = status.openQuestions.filter((q) => !told.current.has(q.id));
          if (!status.done && fresh.length > 0) {
            for (const q of fresh) told.current.add(q.id);
            const remaining = [...status.openQuestions]
              .filter((q) => q.id !== state.currentId)
              .sort((a, b) => b.priority - a.priority);
            speak.current("[DEBRIEF]", forAgent(remaining));
          }
          return;
        }
        case "teachback": {
          const { text } = await client.requestTeachBack(sessionId);
          if (!alive.current) return;
          dispatch({ type: "TEACHBACK_OK", text });
          speak.current("[TEACHBACK]", text);
          markSince();
          return;
        }
        case "confirm": {
          const confirmed = state.phase === "teachback";
          const correctionSegmentIds =
            state.phase === "correcting" && state.submitting ? state.submitting : [];
          const result = await client.confirmTeachBack(sessionId, {
            tMs: Math.max(0, Math.round(clock())),
            confirmed,
            correctionSegmentIds,
          });
          if (!alive.current) return;
          dispatch({
            type: "CONFIRM_OK",
            confirmed,
            tMs: Math.max(0, Math.round(clock())),
            workMap: result.workMap,
            recheckText: result.recheckText,
          });
          if (!confirmed && result.recheckText) speak.current("[TEACHBACK]", result.recheckText);
          markSince();
          return;
        }
        case "predictions": {
          if (!("ctx" in state)) return;
          const { variants } = await client.getPredictionVariants(state.ctx.workMapId);
          if (!alive.current) return;
          dispatch({ type: "PREDICTIONS_OK", variants });
          return;
        }
      }
    })().catch(fail);
  }, [state, client, sessionId, clock, markSince]);

  // Shadow states each prediction, one at a time.
  const spokenVariant = useRef<string | null>(null);
  const current = state.phase === "predicting" ? currentVariant(state.variants, state.marks) : null;
  useEffect(() => {
    if (state.phase !== "predicting" || !state.variants || !current) return;
    if (spokenVariant.current === current.id) return;
    spokenVariant.current = current.id;
    const index = state.variants.indexOf(current);
    const step = state.ctx.workMap?.steps.find((s) => s.id === current.becauseStepId);
    speak.current(
      "[TEACHBACK]",
      predictionSentence(current, index, state.variants.length, step?.title),
    );
    markSince();
  }, [state, current, markSince]);

  // Spoken answers: advance when Shadow speaks after the expert, or on a spoken yes/no.
  useEffect(() => {
    const lines = voice.transcript;
    if (lines.length === 0) return;
    switch (state.phase) {
      case "asking":
      case "correcting": {
        if (state.submitting) return;
        const answer = collectAnswer(lines, since.current, eligible);
        if (!answer.complete || answer.segmentIds.length === 0) return;
        since.current = answer.endIndex;
        dispatch(
          state.phase === "asking"
            ? { type: "ANSWER", segmentIds: answer.segmentIds }
            : { type: "SUBMIT_CORRECTION", segmentIds: answer.segmentIds },
        );
        return;
      }
      case "teachback": {
        if (state.text === null || state.confirming) return;
        const heard = firstConfirmation(lines, since.current, eligible);
        if (!heard) return;
        if (heard.answer === "yes") {
          since.current = heard.index + 1;
          dispatch({ type: "CONFIRM" });
        } else if (canCorrect(state)) {
          // The "no, actually…" line is part of the correction, so `since` stays put.
          dispatch({ type: "CORRECT" });
        } else {
          since.current = heard.index + 1;
        }
        return;
      }
      case "predicting": {
        if (!current) return;
        const heard = firstConfirmation(lines, since.current, eligible);
        if (!heard) return;
        since.current = heard.index + 1;
        dispatch({
          type: "MARK",
          variantId: current.id,
          mark: heard.answer === "yes" ? "right" : "wrong",
        });
        return;
      }
      default:
        return;
    }
  }, [voice.transcript, state, current, eligible]);

  const spoken =
    state.phase === "asking" || state.phase === "correcting"
      ? collectAnswer(voice.transcript, since.current, eligible)
      : { segmentIds: [], complete: false, endIndex: -1 };

  const submitSpoken = useCallback(() => {
    const answer = collectAnswer(transcript.current, since.current, eligible);
    if (answer.segmentIds.length === 0) return;
    since.current = transcript.current.length;
    dispatch(
      state.phase === "correcting"
        ? { type: "SUBMIT_CORRECTION", segmentIds: answer.segmentIds }
        : { type: "ANSWER", segmentIds: answer.segmentIds },
    );
  }, [state.phase, eligible]);

  const submitTyped = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || (state.phase !== "asking" && state.phase !== "correcting")) return false;
      const id = sendTypedLine(trimmed);
      if (!id) return false;
      since.current = transcript.current.length;
      dispatch(
        state.phase === "correcting"
          ? { type: "SUBMIT_CORRECTION", segmentIds: [id] }
          : { type: "ANSWER", segmentIds: [id] },
      );
      return true;
    },
    [state.phase, sendTypedLine],
  );

  const start = useCallback(() => dispatch({ type: "END" }), []);
  const confirm = useCallback(() => dispatch({ type: "CONFIRM" }), []);
  const correct = useCallback(() => dispatch({ type: "CORRECT" }), []);
  const cancelCorrection = useCallback(() => dispatch({ type: "CANCEL_CORRECTION" }), []);
  const mark = useCallback(
    (variantId: string, value: PredictionMark) =>
      dispatch({ type: "MARK", variantId, mark: value }),
    [],
  );
  const retry = useCallback(() => dispatch({ type: "RETRY" }), []);
  const skip = useCallback(() => dispatch({ type: "SKIP" }), []);

  return {
    state,
    spoken,
    start,
    submitSpoken,
    submitTyped,
    confirm,
    correct,
    cancelCorrection,
    mark,
    retry,
    skip,
  };
}
