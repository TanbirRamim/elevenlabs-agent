import type {
  DebriefStatus,
  EndSessionResponse,
  OpenQuestion,
  Outcome,
  WorkMap,
} from "@shadow/schema";

/**
 * The debrief flow (docs/IMPLEMENTATION_PLAN.md §6.7, TAN-7 and TAN-8) as a pure reducer.
 *
 * idle -> ending -> asking -> teachback <-> correcting -> predicting -> confirmed
 * Any API call can fail into `error`, which offers a retry (and, for the optional steps
 * after the debrief questions, a way to continue without that step).
 *
 * The reducer never talks to the API or the voice agent. `pendingOp` tells the host which
 * call the current state is waiting for; the host performs it and dispatches the result.
 */

/** A correction triggers a patch and a one-sentence re-check, at most this many times. */
export const MAX_CORRECTION_ROUNDS = 2;
/** Hard cap on debrief questions (§6.7 rule 3), in case the API never reports `done`. */
export const MAX_DEBRIEF_QUESTIONS = 8;

export interface PredictionVariant {
  id: string;
  description: string;
  predictedOutcome: Outcome;
  becauseStepId: string;
}

export type PredictionMark = "right" | "wrong";

export interface DebriefContext {
  workMapId: string;
  coverage: number;
  /** Display order: answered questions in the order they were answered, then open ones by priority. */
  questions: OpenQuestion[];
  answeredIds: string[];
  /** Debrief questions the API has counted as asked. */
  asked: number;
  /** The API's done rule was met (as opposed to running out of questions). */
  done: boolean;
  /** The latest map returned by the API, once the teach-back step has returned one. */
  workMap: WorkMap | null;
  /** Session time the teach-back was confirmed, or null when it was not. */
  teachBackConfirmedAtMs: number | null;
}

export type DebriefOp = "end" | "answer" | "teachback" | "confirm" | "predictions";

export type ActiveState =
  | { phase: "idle" }
  | { phase: "ending" }
  | {
      phase: "asking";
      ctx: DebriefContext;
      currentId: string;
      /** Set while `answerDebrief` is in flight, with the segments being submitted. */
      submitting: string[] | null;
    }
  | {
      phase: "teachback";
      ctx: DebriefContext;
      /** Null while the teach-back text is being fetched. */
      text: string | null;
      /** Corrections applied so far. */
      round: number;
      /** True when `text` is the one-sentence re-check after a correction. */
      recheck: boolean;
      /** True while the confirmation is being sent. */
      confirming: boolean;
    }
  | {
      phase: "correcting";
      ctx: DebriefContext;
      text: string;
      round: number;
      recheck: boolean;
      /** Set while the correction is being sent, with its segments. */
      submitting: string[] | null;
    }
  | {
      phase: "predicting";
      ctx: DebriefContext;
      /** Null while the variants are being fetched. */
      variants: PredictionVariant[] | null;
      marks: Record<string, PredictionMark>;
    }
  | {
      phase: "confirmed";
      ctx: DebriefContext;
      variants: PredictionVariant[];
      marks: Record<string, PredictionMark>;
    };

export type DebriefState =
  | ActiveState
  | {
      phase: "error";
      op: DebriefOp;
      message: string;
      /** Optional steps (teach-back, predictions) can be skipped; the questions cannot. */
      canSkip: boolean;
      /** The in-flight state to return to on retry. */
      resume: ActiveState;
    };

export type DebriefEvent =
  | { type: "END" }
  | { type: "END_OK"; result: EndSessionResponse }
  | { type: "ANSWER"; segmentIds: string[] }
  | { type: "ANSWER_OK"; status: DebriefStatus }
  | { type: "TEACHBACK_OK"; text: string }
  | { type: "CONFIRM" }
  | { type: "CORRECT" }
  | { type: "CANCEL_CORRECTION" }
  | { type: "SUBMIT_CORRECTION"; segmentIds: string[] }
  | {
      type: "CONFIRM_OK";
      confirmed: boolean;
      tMs: number;
      workMap: WorkMap;
      recheckText?: string | undefined;
    }
  | { type: "PREDICTIONS_OK"; variants: PredictionVariant[] }
  | { type: "MARK"; variantId: string; mark: PredictionMark }
  | { type: "FAILED"; op: DebriefOp; message: string }
  | { type: "RETRY" }
  | { type: "SKIP" };

export const initialDebriefState: DebriefState = { phase: "idle" };

const SKIPPABLE: ReadonlySet<DebriefOp> = new Set(["teachback", "confirm", "predictions"]);

export function debriefReducer(state: DebriefState, event: DebriefEvent): DebriefState {
  switch (event.type) {
    case "END":
      return state.phase === "idle" ? { phase: "ending" } : state;

    case "END_OK": {
      if (state.phase !== "ending") return state;
      const { workMapId, coverage, openQuestions } = event.result;
      const ctx: DebriefContext = {
        workMapId,
        coverage,
        questions: byPriority(openQuestions),
        answeredIds: [],
        asked: 0,
        done: false,
        workMap: null,
        teachBackConfirmedAtMs: null,
      };
      const first = ctx.questions[0];
      return first ? asking(ctx, first.id) : loadingTeachBack(ctx);
    }

    case "ANSWER":
      if (state.phase !== "asking" || state.submitting || event.segmentIds.length === 0)
        return state;
      return { ...state, submitting: [...event.segmentIds] };

    case "ANSWER_OK": {
      if (state.phase !== "asking" || !state.submitting) return state;
      const { status } = event;
      const answeredIds = state.ctx.answeredIds.includes(state.currentId)
        ? state.ctx.answeredIds
        : [...state.ctx.answeredIds, state.currentId];
      const answered = answeredIds
        .map((id) => state.ctx.questions.find((q) => q.id === id))
        .filter((q): q is OpenQuestion => q !== undefined);
      const open = byPriority(status.openQuestions).filter((q) => !answeredIds.includes(q.id));
      const ctx: DebriefContext = {
        ...state.ctx,
        coverage: status.coverage,
        questions: [...answered, ...open],
        answeredIds,
        asked: status.asked,
        done: status.done,
      };
      const next = open[0];
      if (status.done || !next || status.asked >= MAX_DEBRIEF_QUESTIONS) {
        return loadingTeachBack(ctx);
      }
      return asking(ctx, next.id);
    }

    case "TEACHBACK_OK":
      if (state.phase !== "teachback" || state.text !== null) return state;
      return { ...state, text: event.text };

    case "CONFIRM":
      if (state.phase !== "teachback" || state.text === null || state.confirming) return state;
      return { ...state, confirming: true };

    case "CORRECT":
      if (
        state.phase !== "teachback" ||
        state.text === null ||
        state.confirming ||
        !canCorrect(state)
      )
        return state;
      return {
        phase: "correcting",
        ctx: state.ctx,
        text: state.text,
        round: state.round,
        recheck: state.recheck,
        submitting: null,
      };

    case "CANCEL_CORRECTION":
      if (state.phase !== "correcting" || state.submitting) return state;
      return {
        phase: "teachback",
        ctx: state.ctx,
        text: state.text,
        round: state.round,
        recheck: state.recheck,
        confirming: false,
      };

    case "SUBMIT_CORRECTION":
      if (state.phase !== "correcting" || state.submitting || event.segmentIds.length === 0)
        return state;
      return { ...state, submitting: [...event.segmentIds] };

    case "CONFIRM_OK": {
      if (event.confirmed) {
        if (state.phase !== "teachback" || !state.confirming) return state;
        return {
          phase: "predicting",
          ctx: {
            ...state.ctx,
            workMap: event.workMap,
            teachBackConfirmedAtMs: event.workMap.teachBackConfirmedAtMs ?? event.tMs,
          },
          variants: null,
          marks: {},
        };
      }
      if (state.phase !== "correcting" || !state.submitting) return state;
      return {
        phase: "teachback",
        ctx: { ...state.ctx, workMap: event.workMap },
        text: event.recheckText ?? state.text,
        round: state.round + 1,
        recheck: event.recheckText !== undefined,
        confirming: false,
      };
    }

    case "PREDICTIONS_OK": {
      if (state.phase !== "predicting" || state.variants !== null) return state;
      if (event.variants.length === 0) {
        return { phase: "confirmed", ctx: state.ctx, variants: [], marks: {} };
      }
      return { ...state, variants: event.variants };
    }

    case "MARK": {
      if (state.phase !== "predicting" || !state.variants) return state;
      if (!state.variants.some((v) => v.id === event.variantId)) return state;
      const marks = { ...state.marks, [event.variantId]: event.mark };
      if (state.variants.every((v) => marks[v.id] !== undefined)) {
        return { phase: "confirmed", ctx: state.ctx, variants: state.variants, marks };
      }
      return { ...state, marks };
    }

    case "FAILED": {
      if (state.phase === "error" || pendingOp(state) !== event.op) return state;
      return {
        phase: "error",
        op: event.op,
        message: event.message,
        canSkip: SKIPPABLE.has(event.op),
        resume: state,
      };
    }

    case "RETRY":
      // A fresh object, so a host keyed on state identity performs the call again.
      return state.phase === "error" ? { ...state.resume } : state;

    case "SKIP": {
      if (state.phase !== "error" || !state.canSkip || state.resume.phase === "idle") return state;
      if (state.resume.phase === "ending") return state;
      const ctx = state.resume.ctx;
      if (state.op === "predictions") {
        return { phase: "confirmed", ctx, variants: [], marks: {} };
      }
      return { phase: "predicting", ctx, variants: null, marks: {} };
    }
  }
}

/** The API call the state is waiting for, if any. */
export function pendingOp(state: DebriefState): DebriefOp | null {
  switch (state.phase) {
    case "ending":
      return "end";
    case "asking":
      return state.submitting ? "answer" : null;
    case "teachback":
      if (state.text === null) return "teachback";
      return state.confirming ? "confirm" : null;
    case "correcting":
      return state.submitting ? "confirm" : null;
    case "predicting":
      return state.variants === null ? "predictions" : null;
    default:
      return null;
  }
}

/** True while the expert may still send a correction (max two rounds). */
export function canCorrect(state: { round: number }): boolean {
  return state.round < MAX_CORRECTION_ROUNDS;
}

/** The prediction Singoda AI is waiting on: the first unmarked variant. */
export function currentVariant(
  variants: PredictionVariant[] | null,
  marks: Record<string, PredictionMark>,
): PredictionVariant | null {
  return variants?.find((v) => marks[v.id] === undefined) ?? null;
}

function asking(ctx: DebriefContext, currentId: string): DebriefState {
  return { phase: "asking", ctx, currentId, submitting: null };
}

function loadingTeachBack(ctx: DebriefContext): DebriefState {
  return { phase: "teachback", ctx, text: null, round: 0, recheck: false, confirming: false };
}

function byPriority(questions: readonly OpenQuestion[]): OpenQuestion[] {
  return [...questions].sort((a, b) => b.priority - a.priority);
}
