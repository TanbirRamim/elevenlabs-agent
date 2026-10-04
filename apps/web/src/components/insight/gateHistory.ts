import type { CandidateQuestion } from "@shadow/schema";
import type { GateDecision } from "@/lib/turnGate";
import type { TimelineDropped, TimelineQuestion, TimelineSpan } from "./GateTimeline";
import { type GateReason, REASON_SENTENCES } from "./reasons";

/**
 * Turns the live Turn Gate samples (one every 250 ms) into the series GateTimeline draws:
 * speech spans, typing and screen instants, Shadow's asking spans, off-the-record spans, and
 * each question with how long the gate held it and why. Pure: no clocks, no React.
 */

/** Speech signals closer than this are one stretch of talking. */
export const SPEECH_JOIN_MS = 1_000;
/** Oldest instants are dropped beyond this, so a long session cannot grow without bound. */
export const MAX_INSTANTS = 2_000;

export interface GateSampleAsked {
  id: string;
  text: string;
  atMs: number;
  pauseMs: { silence: number | null; inputIdle: number | null; screenIdle: number | null };
}

export interface GateSample {
  nowMs: number;
  lastUserSpeechMs: number | null;
  lastInputActivityMs: number | null;
  lastScreenChangeMs: number | null;
  agentSpeaking: boolean;
  offRecord: boolean;
  candidate: Pick<
    CandidateQuestion,
    "id" | "text" | "createdAtMs" | "slot" | "aboutTicketId"
  > | null;
  decision: GateDecision;
  asked: readonly GateSampleAsked[];
}

interface Held {
  id: string;
  text: string;
  readyAtMs: number;
  slot: CandidateQuestion["slot"];
  ticketId: string | undefined;
  heldBy: string[];
  lastReason: GateReason | null;
}

export interface GateHistory {
  speech: TimelineSpan[];
  typing: number[];
  screen: number[];
  offRecord: TimelineSpan[];
  asking: TimelineSpan[];
  questions: TimelineQuestion[];
  dropped: TimelineDropped[];
  /** Session time of the newest sample. */
  nowMs: number;
  prev: {
    speech: number | null;
    typing: number | null;
    screen: number | null;
    agentSpeaking: boolean;
    offRecord: boolean;
  };
  held: Held | null;
}

export const EMPTY_GATE_HISTORY: GateHistory = {
  speech: [],
  typing: [],
  screen: [],
  offRecord: [],
  asking: [],
  questions: [],
  dropped: [],
  nowMs: 0,
  prev: { speech: null, typing: null, screen: null, agentSpeaking: false, offRecord: false },
  held: null,
};

const capped = (list: number[], t: number) =>
  list.length >= MAX_INSTANTS ? [...list.slice(1), t] : [...list, t];

/** Opens a span on a rising edge, extends it while the flag holds. */
function trackFlag(spans: TimelineSpan[], was: boolean, is: boolean, now: number): TimelineSpan[] {
  if (!is) return spans;
  const last = spans.at(-1);
  if (was && last) return [...spans.slice(0, -1), { startMs: last.startMs, endMs: now }];
  return [...spans, { startMs: now, endMs: now }];
}

function dropReason(held: Held): string {
  return held.lastReason === "stale_candidate"
    ? "Out of date before a pause came"
    : "Replaced by a newer question";
}

export function recordGateSample(h: GateHistory, s: GateSample): GateHistory {
  const now = s.nowMs;

  let speech = h.speech;
  if (s.lastUserSpeechMs !== null && s.lastUserSpeechMs !== h.prev.speech) {
    const t = s.lastUserSpeechMs;
    const last = speech.at(-1);
    speech =
      last && t - last.endMs <= SPEECH_JOIN_MS
        ? [...speech.slice(0, -1), { startMs: last.startMs, endMs: Math.max(last.endMs, t) }]
        : [...speech, { startMs: t, endMs: t }];
  }
  const typing =
    s.lastInputActivityMs !== null && s.lastInputActivityMs !== h.prev.typing
      ? capped(h.typing, s.lastInputActivityMs)
      : h.typing;
  const screen =
    s.lastScreenChangeMs !== null && s.lastScreenChangeMs !== h.prev.screen
      ? capped(h.screen, s.lastScreenChangeMs)
      : h.screen;
  const asking = trackFlag(h.asking, h.prev.agentSpeaking, s.agentSpeaking, now);
  const offRecord = trackFlag(h.offRecord, h.prev.offRecord, s.offRecord, now);

  let held = h.held;
  let dropped = h.dropped;
  let questions = h.questions;

  // Newly asked questions, with the hold that preceded them.
  const known = new Set(questions.map((q) => q.id));
  for (const a of s.asked) {
    if (known.has(a.id)) continue;
    const mine = held && held.id === a.id ? held : null;
    questions = [
      ...questions,
      {
        id: a.id,
        atMs: a.atMs,
        text: a.text,
        ...(mine ? { slot: mine.slot, readyAtMs: mine.readyAtMs, heldBy: mine.heldBy } : {}),
        ...(mine?.ticketId ? { ticketId: mine.ticketId } : {}),
        pause: {
          silenceMs: a.pauseMs.silence,
          inputIdleMs: a.pauseMs.inputIdle,
          screenIdleMs: a.pauseMs.screenIdle,
        },
      },
    ];
    if (mine) held = null;
  }

  const askedIds = new Set(questions.map((q) => q.id));
  if (s.candidate && !askedIds.has(s.candidate.id)) {
    if (!held || held.id !== s.candidate.id) {
      if (held) {
        dropped = [
          ...dropped,
          {
            id: held.id,
            atMs: now,
            text: held.text,
            reason: dropReason(held),
            readyAtMs: held.readyAtMs,
          },
        ];
      }
      held = {
        id: s.candidate.id,
        text: s.candidate.text,
        readyAtMs: s.candidate.createdAtMs,
        slot: s.candidate.slot,
        ticketId: s.candidate.aboutTicketId,
        heldBy: [],
        lastReason: null,
      };
    }
    if (!s.decision.open && s.decision.reason !== "no_candidate") {
      const sentence = REASON_SENTENCES[s.decision.reason];
      held = {
        ...held,
        lastReason: s.decision.reason,
        heldBy: held.heldBy.includes(sentence) ? held.heldBy : [...held.heldBy, sentence],
      };
    }
  }

  return {
    speech,
    typing,
    screen,
    offRecord,
    asking,
    questions,
    dropped,
    nowMs: now,
    prev: {
      speech: s.lastUserSpeechMs,
      typing: s.lastInputActivityMs,
      screen: s.lastScreenChangeMs,
      agentSpeaking: s.agentSpeaking,
      offRecord: s.offRecord,
    },
    held,
  };
}

/**
 * The right edge of a live chart: at least two minutes, then the next whole minute with
 * 15 s of headroom, so the "now" line never sits on the edge.
 */
export function liveTimelineEnd(nowMs: number): number {
  return Math.max(120_000, Math.ceil((nowMs + 15_000) / 60_000) * 60_000);
}
