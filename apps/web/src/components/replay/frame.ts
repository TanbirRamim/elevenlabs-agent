import type { Outcome } from "@shadow/schema";
import type { GateDecision, GateSignals } from "../../lib/turnGate";
import type { OrbState } from "../voice/orbState";
import {
  type AskedQuestion,
  type Caption,
  type Chapter,
  captureSignalsAt,
  type DeskView,
  type DroppedQuestion,
  EXPERT_TICKETS,
  type LearnedRef,
  playToSession,
  type ReplayScript,
  sessionToPlay,
  speedAt,
} from "./script";

/**
 * Pure selectors: everything the player shows at a playback time. No React, no clocks, so any
 * time can be rendered directly; scrubbing is just calling these with a different number.
 */

/** Playback ms a pressed button stays visibly pressed. */
const PRESS_MS = 450;
/** Typed captions reveal at this many ms per character, capped by the line's own length. */
const CHAR_MS = 22;

export function chapterAt(script: ReplayScript, playMs: number): Chapter {
  const found = script.chapters.find((c) => playMs < c.endMs) ?? script.chapters.at(-1);
  if (!found) throw new Error("replay script has no chapters");
  return found;
}

export interface Transcript {
  previous: Caption | null;
  current: Caption | null;
  /** Characters of `current` revealed so far. */
  revealed: number;
}

/** The current line and the one before it, within the current chapter. */
export function transcriptAt(script: ReplayScript, playMs: number, instant = false): Transcript {
  const chapter = chapterAt(script, playMs);
  const lines = script.captions.filter(
    (c) => c.startMs >= chapter.startMs && c.startMs < chapter.endMs && c.startMs <= playMs,
  );
  const current = lines.at(-1) ?? null;
  const previous = lines.at(-2) ?? null;
  let revealed = current?.text.length ?? 0;
  if (current && !instant) {
    const budget = Math.max(current.endMs - current.startMs, 300);
    const perChar = Math.min(CHAR_MS, budget / Math.max(1, current.text.length));
    revealed = Math.min(current.text.length, Math.floor((playMs - current.startMs) / perChar));
  }
  return { previous, current, revealed };
}

export function orbStateAt(script: ReplayScript, playMs: number): OrbState {
  const chapter = chapterAt(script, playMs);
  if (chapter.id === "agents") return "idle";
  if (chapter.id === "capture") {
    const s = playToSession(script.segments, playMs);
    const { signals } = captureSignalsAt(script.capture, s);
    if (signals.offRecord) return "off-record";
    if (signals.agentSpeaking) return "speaking";
    return "listening";
  }
  const shadowSpeaking = script.captions.some(
    (c) => c.speaker === "shadow" && playMs >= c.startMs && playMs < c.endMs,
  );
  return shadowSpeaking ? "speaking" : "listening";
}

export interface Clock {
  label: string;
  ms: number;
  /** Time-lapse factor, shown while capture plays faster than real time. */
  speed: number | null;
}

export function clockAt(script: ReplayScript, playMs: number): Clock | null {
  const chapter = chapterAt(script, playMs);
  if (chapter.id === "capture") {
    const speed = speedAt(script.segments, playMs);
    return {
      label: "Capture session",
      ms: playToSession(script.segments, playMs),
      speed: speed > 1.05 ? speed : null,
    };
  }
  if (chapter.id === "map") {
    return { label: "Debrief", ms: interpolate(script.map.clock, playMs), speed: null };
  }
  if (chapter.id === "teach") {
    return { label: "Teach session", ms: Math.max(0, playMs - chapter.startMs), speed: null };
  }
  return null;
}

function interpolate(points: { playMs: number; sessionMs: number }[], playMs: number): number {
  const first = points[0];
  if (!first) return 0;
  if (playMs <= first.playMs) return first.sessionMs;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    if (playMs <= b.playMs) {
      const f = (playMs - a.playMs) / (b.playMs - a.playMs);
      return a.sessionMs + f * (b.sessionMs - a.sessionMs);
    }
  }
  return points.at(-1)?.sessionMs ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------------------------

export interface CaptureFrame {
  sessionMs: number;
  signals: GateSignals;
  decision: GateDecision;
  /** The question Shadow is holding while the gate is closed. */
  holding: { text: string; slot: AskedQuestion["slot"]; ticketId: string; sinceMs: number } | null;
  asked: AskedQuestion[];
  /** The question being asked right now, if any. */
  asking: AskedQuestion | null;
  /** A question withdrawn in the last few seconds of playback. */
  justDropped: DroppedQuestion | null;
  learned: LearnedRef[];
  desk: DeskView;
}

export function captureAt(script: ReplayScript, playMs: number): CaptureFrame {
  const { capture, segments } = script;
  const sessionMs = playToSession(segments, playMs);
  const { signals, decision, candidate } = captureSignalsAt(capture, sessionMs);
  const asked = capture.asked.filter((q) => q.atMs <= sessionMs);
  const asking =
    capture.asked.find((q) => {
      const c = capture.candidates.find((x) => x.id === q.candidateId);
      return c !== undefined && sessionMs >= q.atMs && sessionMs < q.atMs + c.askMs;
    }) ?? null;
  const justDropped =
    capture.dropped.find((d) => {
      const at = sessionToPlay(segments, d.atMs);
      return playMs >= at && playMs < at + 3_000;
    }) ?? null;
  return {
    sessionMs,
    signals,
    decision,
    holding:
      candidate && !decision.open && !asking
        ? {
            text: candidate.text,
            slot: candidate.slot,
            ticketId: candidate.ticketId,
            sinceMs: candidate.createdAtMs,
          }
        : null,
    asked,
    asking,
    justDropped,
    learned: capture.learned.filter((l) => l.atMs <= sessionMs).map((l) => l.ref),
    desk: captureDeskAt(script, playMs, sessionMs),
  };
}

function captureDeskAt(script: ReplayScript, playMs: number, sessionMs: number): DeskView {
  let selectedId: string | null = null;
  const committed: Record<string, Outcome> = {};
  let field: DeskView["field"] = null;
  let pressed: Outcome | null = null;
  for (const b of script.capture.desk) {
    if (b.kind === "open") {
      if (b.atMs > sessionMs) break;
      selectedId = b.ticketId;
      field = null;
    } else if (b.kind === "type") {
      if (b.startMs > sessionMs) break;
      const f = Math.min(1, (sessionMs - b.startMs) / (b.endMs - b.startMs));
      field = {
        label: b.label,
        value: b.text.slice(0, Math.round(f * b.text.length)),
        typing: f < 1,
      };
    } else {
      if (b.atMs > sessionMs) break;
      if (selectedId) committed[selectedId] = b.outcome;
      const at = sessionToPlay(script.segments, b.atMs);
      pressed = playMs - at < PRESS_MS ? b.outcome : null;
    }
  }
  const phase = selectedId && committed[selectedId] ? "committed" : "idle";
  return {
    tickets: EXPERT_TICKETS,
    selectedId,
    committed,
    field,
    pressed,
    phase,
    blockedRuleIds: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------------------------

export interface MapFrame {
  coverage: number;
  answered: number;
  done: boolean;
  gaps: { id: string; text: string; kind: "unseen" | "exception"; status: GapStatus }[];
  stepIds: string[];
  teachBack: {
    text: string;
    recheck: boolean;
    round: number;
    confirmedSessionMs: number | null;
  } | null;
}

export type GapStatus = "open" | "asking" | "answered";

export function mapAt(script: ReplayScript, playMs: number): MapFrame {
  const { coverage, gaps, steps, teachBack } = script.map;
  const reached = coverage.filter((c) => c.atMs <= playMs);
  const value = reached.at(-1)?.value ?? coverage[0]?.value ?? 0;
  const answered = gaps.filter((g) => g.answeredAtMs <= playMs).length;
  return {
    coverage: value,
    answered,
    done: value >= 0.9,
    gaps: gaps.map((g) => ({
      id: g.id,
      text: g.text,
      kind: g.kind,
      status: g.answeredAtMs <= playMs ? "answered" : g.askAtMs <= playMs ? "asking" : "open",
    })),
    stepIds: steps.filter((s) => s.atMs <= playMs).map((s) => s.id),
    teachBack:
      playMs < teachBack.showAtMs
        ? null
        : {
            text: playMs >= teachBack.recheckAtMs ? teachBack.recheckText : teachBack.text,
            recheck: playMs >= teachBack.recheckAtMs,
            round: playMs >= teachBack.recheckAtMs ? 1 : 0,
            confirmedSessionMs:
              playMs >= teachBack.confirmedAtMs ? teachBack.confirmedSessionMs : null,
          },
  };
}

// ---------------------------------------------------------------------------------------------
// Teach
// ---------------------------------------------------------------------------------------------

export interface TeachFrame {
  desk: DeskView;
  /** The predict callout on N2: Jonas's pick once he has said it, Maya's answer once shown. */
  predict: { chosen: Outcome | null; revealed: boolean } | null;
  showIntervention: boolean;
  resolvedOutcome: Outcome | null;
  showMastery: boolean;
  saved: number;
  held: number;
}

export function teachAt(script: ReplayScript, playMs: number): TeachFrame {
  const t = script.teach;
  const committed: Record<string, Outcome> = {};
  let selectedId: string | null = null;
  let phase: DeskView["phase"] = "idle";
  let pressed: Outcome | null = null;
  const pressedAt = (at: number, outcome: Outcome) => {
    if (playMs >= at && playMs < at + PRESS_MS) pressed = outcome;
  };

  // N2 first: a judgment point, so Shadow asks Jonas to predict before he acts.
  if (playMs >= t.openN2AtMs) selectedId = t.predict.ticketId;
  pressedAt(t.commitN2AtMs, t.predict.chosen);
  if (playMs >= t.commitN2AtMs) {
    committed[t.predict.ticketId] = t.predict.chosen;
    phase = "committed";
  }
  // Then N1: he presses Refund and the guard pauses the save.
  if (playMs >= t.openN1AtMs) {
    selectedId = t.ticketId;
    phase = "idle";
  }
  pressedAt(t.pressRefundAtMs, t.attempted);
  if (playMs >= t.pressRefundAtMs) phase = playMs >= t.blockedAtMs ? "blocked" : "checking";
  pressedAt(t.pressRerouteAtMs, t.rerouted);
  if (playMs >= t.pressRerouteAtMs) {
    committed[t.ticketId] = t.rerouted;
    phase = "committed";
  }

  const predicting = playMs >= t.predictAtMs && playMs < t.openN1AtMs;
  return {
    desk: {
      tickets: t.tickets,
      selectedId,
      committed,
      field: null,
      pressed,
      phase,
      blockedRuleIds: phase === "blocked" ? t.verdict.ruleIds : [],
    },
    predict: predicting
      ? {
          chosen: playMs >= t.predictChosenAtMs ? t.predict.chosen : null,
          revealed: playMs >= t.predictResultAtMs,
        }
      : null,
    showIntervention: playMs >= t.interventionAtMs && playMs < t.masteryAtMs,
    resolvedOutcome: playMs >= t.pressRerouteAtMs ? t.rerouted : null,
    showMastery: playMs >= t.masteryAtMs,
    saved: Object.keys(committed).length,
    held: playMs >= t.blockedAtMs ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Moments: where reduced motion and "next/previous" stop
// ---------------------------------------------------------------------------------------------

/** Every point where something meaningful changes: chapter starts and caption starts. */
export function momentsOf(script: ReplayScript): number[] {
  const set = new Set<number>([0]);
  for (const c of script.chapters) set.add(c.startMs);
  for (const c of script.captions) set.add(c.startMs);
  set.add(script.teach.predictResultAtMs);
  set.add(script.teach.blockedAtMs);
  set.add(script.teach.pressRerouteAtMs);
  return [...set].filter((t) => t < script.durationMs).sort((a, b) => a - b);
}

/** The latest moment at or before `playMs`: reduced motion renders the replay in these steps. */
export function snapToMoment(moments: readonly number[], playMs: number): number {
  let snapped = moments[0] ?? 0;
  for (const m of moments) {
    if (m > playMs) break;
    snapped = m;
  }
  return snapped;
}

export function nextMoment(moments: readonly number[], playMs: number): number | null {
  return moments.find((m) => m > playMs + 1) ?? null;
}

export function previousMoment(moments: readonly number[], playMs: number): number {
  const before = moments.filter((m) => m < playMs - 1);
  return before.at(-1) ?? 0;
}
