import {
  type CandidateQuestion,
  type GuardVerdict,
  type MasteryReport,
  type Outcome,
  type PublicTicket,
  Ticket,
} from "@shadow/schema";
import { z } from "zod";
import ticketsJson from "../../../../../seed/tickets.json";
import { decide, type GateDecision, type GateSignals } from "../../lib/turnGate";
import { sampleWorkMap } from "../workmap/fixture";

/**
 * The 90-second story replay behind `/demo`: a typed, deterministic timeline of the demo
 * session (docs/demo-script.md), told in four chapters.
 *
 * Two clocks run through it:
 * - **Playback** (`playMs`): what the viewer scrubs, 0 to `durationMs`.
 * - **Session** (`sessionMs`): the expert's capture session, as the product saw it. Capture is
 *   time-lapsed (fast while Maya works, close to real time at the pauses that matter); the
 *   `segments` table maps one onto the other.
 *
 * Faithful, not hand-drawn: Shadow's live questions are not placed by hand. The script lists
 * what Maya did (speech, typing, screen changes) and the questions the Curiosity Engine had
 * ready; `simulateCapture` then steps through the session and asks a question only when the real
 * Turn Gate (`decide()` from lib/turnGate) opens. Tickets come from seed/tickets.json and the
 * expert's words from the sample Work Map fixture.
 */

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type ChapterId = "capture" | "map" | "teach" | "agents";

export interface Chapter {
  id: ChapterId;
  /** 1-based position in the Capture, Map, Teach, Agents sequence. */
  number: number;
  title: string;
  /** One sentence that orients the viewer for the whole chapter. */
  summary: string;
  startMs: number;
  endMs: number;
}

export interface Span {
  startMs: number;
  endMs: number;
}

export type Speaker = "narrator" | "maya" | "shadow" | "jonas";

export interface Caption {
  id: string;
  speaker: Speaker;
  text: string;
  /** Playback time. */
  startMs: number;
  endMs: number;
  /** Words said off the record: the replay shows that something was said, never what. */
  offRecord?: boolean;
}

/** Something Shadow learned, pointing into the sample Work Map. */
export type LearnedRef = { kind: "step"; id: string } | { kind: "guardrail"; id: string };

type Slot = CandidateQuestion["slot"];

interface ExpertLine extends Span {
  text: string;
  learns?: LearnedRef;
  offRecord?: boolean;
}

/** A question the Curiosity Engine had ready, and what Maya says when it is asked. */
interface CandidateScript {
  id: string;
  ticketId: string;
  slot: Slot;
  priority: number;
  createdAtMs: number;
  text: string;
  /** How long Shadow takes to say it. */
  askMs: number;
  answer: { text: string; durationMs: number; learns?: LearnedRef };
  /** The engine withdraws the question at this time (e.g. the expert answered it unprompted). */
  dropped?: { atMs: number; reason: string };
}

type DeskBeat =
  | { kind: "open"; atMs: number; ticketId: string }
  | { kind: "type"; startMs: number; endMs: number; label: string; text: string }
  | { kind: "commit"; atMs: number; outcome: Outcome };

/** A question Shadow asked during capture, with the pause that let it through. */
export interface AskedQuestion {
  id: string;
  candidateId: string;
  ticketId: string;
  slot: Slot;
  priority: number;
  text: string;
  /** Session time the gate opened and Shadow started to speak. */
  atMs: number;
  createdAtMs: number;
  /** Measured at `atMs`: how long each signal had been quiet. Null: it never fired. */
  pause: { silenceMs: number | null; inputIdleMs: number | null; screenIdleMs: number | null };
  /** Exactly what `decide()` was given when it opened for this question. */
  signals: GateSignals;
  /** Why the gate kept the question back while it waited, in the order the reasons occurred. */
  heldBy: Extract<GateDecision, { open: false }>["reason"][];
}

export interface DroppedQuestion {
  id: string;
  ticketId: string;
  text: string;
  createdAtMs: number;
  atMs: number;
  reason: string;
}

export interface LearnedEvent {
  atMs: number;
  ref: LearnedRef;
}

/** Everything the capture session produced, in session time. */
export interface CaptureTrack {
  durationMs: number;
  /** Expert speech; spans off the record are kept here but never shown or stored. */
  speech: Span[];
  agentSpeech: Span[];
  /** DeskSim input activity (keystrokes, clicks), throttled to one per 500 ms like DeskSim. */
  input: number[];
  /** Screen changes (frame hash changed). */
  screen: number[];
  offRecord: Span[];
  candidates: CandidateScript[];
  asked: AskedQuestion[];
  dropped: DroppedQuestion[];
  /** While a question waited for the gate. */
  holds: (Span & { candidateId: string })[];
  learned: LearnedEvent[];
  lines: ExpertLine[];
  desk: DeskBeat[];
}

/** Maps a stretch of session time onto a stretch of playback. */
export interface Segment {
  sessionStartMs: number;
  sessionEndMs: number;
  playStartMs: number;
  playEndMs: number;
}

export interface DeskView {
  tickets: PublicTicket[];
  selectedId: string | null;
  committed: Record<string, Outcome>;
  field: { label: string; value: string; typing: boolean } | null;
  /** The action button being pressed right now. */
  pressed: Outcome | null;
  phase: "idle" | "checking" | "blocked" | "committed";
  blockedRuleIds: string[];
}

export interface Gap {
  id: string;
  text: string;
  kind: "unseen" | "exception";
  askAtMs: number;
  answeredAtMs: number;
}

export interface ReplayScript {
  durationMs: number;
  chapters: Chapter[];
  captions: Caption[];
  capture: CaptureTrack;
  segments: Segment[];
  map: {
    coverage: { atMs: number; value: number }[];
    gaps: Gap[];
    /** Playback time each Work Map step appears. */
    steps: { id: string; atMs: number }[];
    teachBack: {
      showAtMs: number;
      text: string;
      correctionAtMs: number;
      recheckAtMs: number;
      recheckText: string;
      confirmedAtMs: number;
      /** Session time of the confirmation, shown on the badge (matches the Work Map). */
      confirmedSessionMs: number;
    };
    /** Playback anchors for the debrief's session clock. */
    clock: { playMs: number; sessionMs: number }[];
  };
  teach: {
    tickets: PublicTicket[];
    verdict: GuardVerdict;
    ticketId: string;
    attempted: Outcome;
    rerouted: Outcome;
    predictAtMs: number;
    pressRefundAtMs: number;
    blockedAtMs: number;
    interventionAtMs: number;
    pressRerouteAtMs: number;
    openN2AtMs: number;
    commitN2AtMs: number;
    masteryAtMs: number;
    mastery: MasteryReport;
  };
}

// ---------------------------------------------------------------------------------------------
// Data: seed tickets and the expert's words
// ---------------------------------------------------------------------------------------------

const SEED = z.array(Ticket).parse(ticketsJson);

function publicTicket(id: string): PublicTicket {
  const t = SEED.find((x) => x.id === id);
  if (!t) throw new Error(`seed/tickets.json has no ticket ${id}`);
  const { label: _label, ...rest } = t;
  return rest;
}

/** The expert's verbatim words from the sample Work Map. */
function stepQuote(stepId: string): string {
  const step = sampleWorkMap.steps.find((s) => s.id === stepId);
  if (!step) throw new Error(`sample Work Map has no step ${stepId}`);
  return step.reason.text;
}

export const EXPERT_TICKETS: PublicTicket[] = ["T1", "T2", "T3", "T4"].map(publicTicket);
export const NEW_HIRE_TICKETS: PublicTicket[] = ["N1", "N2"].map(publicTicket);

// ---------------------------------------------------------------------------------------------
// Capture, in session time
// ---------------------------------------------------------------------------------------------

const OFF_RECORD: Span[] = sampleWorkMap.offRecordSpans.map(([startMs, endMs]) => ({
  startMs,
  endMs,
}));

const LINES: ExpertLine[] = [
  { startMs: 39_500, endMs: 45_000, text: stepQuote("S1"), learns: { kind: "step", id: "S1" } },
  { startMs: 152_000, endMs: 156_000, text: "Same amount, twice, on the same day. A duplicate." },
  { startMs: 184_400, endMs: 186_000, text: "Refunding one of them." },
  {
    startMs: 292_000,
    endMs: 297_000,
    text: "Annual plan, two hundred and forty, and she has already told her bank.",
  },
  { startMs: 450_000, endMs: 457_000, text: "Changed email, and now a refund. No." },
  {
    startMs: 462_000,
    endMs: 471_000,
    text: stepQuote("S5"),
    learns: { kind: "guardrail", id: "G3" },
  },
  { startMs: 537_000, endMs: 539_500, text: "Off the record for a minute." },
  { startMs: 541_000, endMs: 556_000, text: "", offRecord: true },
  { startMs: 598_000, endMs: 600_000, text: "Back on the record." },
  { startMs: 611_000, endMs: 614_000, text: "That's the queue. Ending the task." },
];

const DESK_BEATS: DeskBeat[] = [
  { kind: "open", atMs: 38_000, ticketId: "T1" },
  {
    kind: "type",
    startMs: 58_000,
    endMs: 74_000,
    label: "Reply",
    text: "Invoice macro: Hi Ava, your September invoice is attached again.",
  },
  { kind: "commit", atMs: 76_000, outcome: "reply" },
  { kind: "open", atMs: 150_000, ticketId: "T2" },
  {
    kind: "type",
    startMs: 168_000,
    endMs: 176_000,
    label: "Internal note",
    text: "Duplicate charge. Refund one.",
  },
  { kind: "commit", atMs: 184_000, outcome: "refund" },
  { kind: "open", atMs: 290_000, ticketId: "T3" },
  {
    kind: "type",
    startMs: 298_500,
    endMs: 309_000,
    label: "Internal note",
    text: "Chargeback open. No refund. Billing disputes to review.",
  },
  { kind: "commit", atMs: 310_000, outcome: "handoff_billing_disputes" },
  { kind: "open", atMs: 440_000, ticketId: "T4" },
  { kind: "commit", atMs: 460_000, outcome: "handoff_security" },
];

const CANDIDATES: CandidateScript[] = [
  {
    id: "c1",
    ticketId: "T1",
    slot: "reason",
    priority: 0.72,
    createdAtMs: 76_500,
    text: "You used the invoice macro there. When would you write your own reply instead?",
    askMs: 3_000,
    answer: { text: stepQuote("S2"), durationMs: 6_500, learns: { kind: "step", id: "S2" } },
  },
  {
    id: "c2",
    ticketId: "T2",
    slot: "guardrail",
    priority: 0.81,
    createdAtMs: 184_800,
    text: "You refunded that one yourself. Is there an amount where you wouldn’t?",
    askMs: 3_000,
    answer: { text: stepQuote("S3"), durationMs: 6_000, learns: { kind: "guardrail", id: "G1" } },
  },
  {
    id: "c3",
    ticketId: "T3",
    slot: "guardrail",
    priority: 0.88,
    createdAtMs: 300_000,
    text: "You held that refund instead of sending it. What stopped you?",
    askMs: 3_000,
    answer: { text: stepQuote("S4"), durationMs: 6_500, learns: { kind: "guardrail", id: "G2" } },
  },
  {
    id: "c4",
    ticketId: "T4",
    slot: "guardrail",
    priority: 0.83,
    createdAtMs: 460_500,
    text: "You sent that one to Security instead of refunding. What tipped it?",
    askMs: 3_000,
    answer: { text: "", durationMs: 0 },
    dropped: { atMs: 471_200, reason: "Maya answered it aloud before there was a pause" },
  },
];

const CAPTURE_END_MS = 620_000;
const SIM_TICK_MS = 100;
const ANSWER_DELAY_MS = 400;
const INPUT_THROTTLE_MS = 500;
const SCREEN_WHILE_TYPING_MS = 2_000;

/** Input and screen activity implied by the desk beats: typing, clicks, and the frames they change. */
function deskSignals(beats: DeskBeat[]): { input: number[]; screen: number[] } {
  const input: number[] = [];
  const screen: number[] = [];
  for (const b of beats) {
    if (b.kind === "type") {
      for (let t = b.startMs; t <= b.endMs; t += INPUT_THROTTLE_MS) input.push(t);
      for (let t = b.startMs; t <= b.endMs; t += SCREEN_WHILE_TYPING_MS) screen.push(t);
      screen.push(b.endMs);
    } else {
      input.push(b.atMs);
      screen.push(b.atMs);
    }
  }
  const sortUnique = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
  return { input: sortUnique(input), screen: sortUnique(screen) };
}

const inside = (t: number, s: Span) => t >= s.startMs && t < s.endMs;

/** Last time ≤ t a span was active: t itself while inside one. */
function lastSpanActivity(spans: readonly Span[], t: number): number | null {
  let last: number | null = null;
  for (const s of spans) {
    if (s.startMs > t) continue;
    const at = inside(t, s) ? t : s.endMs;
    if (last === null || at > last) last = at;
  }
  return last;
}

function lastInstant(xs: readonly number[], t: number): number | null {
  let last: number | null = null;
  for (const x of xs) {
    if (x > t) break;
    last = x;
  }
  return last;
}

interface SimState {
  speech: Span[];
  agentSpeech: Span[];
  input: number[];
  screen: number[];
  offRecord: Span[];
  candidates: CandidateScript[];
  askedAt: Map<string, number>;
}

/** The candidate the gate would consider at time t: the highest priority one still open. */
function activeCandidate(s: SimState, t: number): CandidateScript | null {
  let best: CandidateScript | null = null;
  for (const c of s.candidates) {
    if (c.createdAtMs > t) continue;
    const asked = s.askedAt.get(c.id);
    if (asked !== undefined && asked < t) continue;
    if (c.dropped && c.dropped.atMs <= t) continue;
    if (!best || c.priority > best.priority) best = c;
  }
  return best;
}

/** The Turn Gate's inputs at session time t, built from what the session recorded. */
function signalsFrom(s: SimState, t: number): GateSignals {
  const c = activeCandidate(s, t);
  return {
    nowMs: t,
    lastUserSpeechMs: lastSpanActivity(s.speech, t),
    lastInputActivityMs: lastInstant(s.input, t),
    lastScreenChangeMs: lastInstant(s.screen, t),
    agentSpeaking: s.agentSpeech.some((a) => inside(t, a)),
    offRecord: s.offRecord.some((o) => inside(t, o)),
    questionsAskedMs: [...s.askedAt.values()].filter((at) => at < t).sort((a, b) => a - b),
    candidate: c ? { priority: c.priority, createdAtMs: c.createdAtMs } : null,
  };
}

/**
 * Steps through the session every 100 ms and lets Shadow ask only when `decide()` opens.
 * Asking adds Shadow's speech and the expert's answer to the record, which the gate then sees.
 */
export function simulateCapture(): CaptureTrack {
  const { input, screen } = deskSignals(DESK_BEATS);
  const state: SimState = {
    speech: LINES.map(({ startMs, endMs }) => ({ startMs, endMs })),
    agentSpeech: [],
    input,
    screen,
    offRecord: OFF_RECORD,
    candidates: CANDIDATES,
    askedAt: new Map(),
  };
  const asked: AskedQuestion[] = [];
  const heldBy = new Map<string, AskedQuestion["heldBy"]>();
  const learned: LearnedEvent[] = LINES.filter((l) => l.learns).map((l) => ({
    atMs: l.endMs,
    ref: l.learns as LearnedRef,
  }));

  for (let t = 0; t <= CAPTURE_END_MS; t += SIM_TICK_MS) {
    const signals = signalsFrom(state, t);
    const candidate = activeCandidate(state, t);
    const decision = decide(signals);
    if (!candidate) continue;
    if (!decision.open) {
      const reasons = heldBy.get(candidate.id) ?? [];
      if (reasons.at(-1) !== decision.reason) reasons.push(decision.reason);
      heldBy.set(candidate.id, reasons);
      continue;
    }
    state.askedAt.set(candidate.id, t);
    state.agentSpeech.push({ startMs: t, endMs: t + candidate.askMs });
    const answerStart = t + candidate.askMs + ANSWER_DELAY_MS;
    const answerEnd = answerStart + candidate.answer.durationMs;
    state.speech.push({ startMs: answerStart, endMs: answerEnd });
    if (candidate.answer.learns) learned.push({ atMs: answerEnd, ref: candidate.answer.learns });
    asked.push({
      id: `q${asked.length + 1}`,
      candidateId: candidate.id,
      ticketId: candidate.ticketId,
      slot: candidate.slot,
      priority: candidate.priority,
      text: candidate.text,
      atMs: t,
      createdAtMs: candidate.createdAtMs,
      pause: {
        silenceMs: signals.lastUserSpeechMs === null ? null : t - signals.lastUserSpeechMs,
        inputIdleMs: signals.lastInputActivityMs === null ? null : t - signals.lastInputActivityMs,
        screenIdleMs: signals.lastScreenChangeMs === null ? null : t - signals.lastScreenChangeMs,
      },
      heldBy: heldBy.get(candidate.id) ?? [],
      signals,
    });
  }

  const dropped: DroppedQuestion[] = CANDIDATES.flatMap((c) =>
    c.dropped && !state.askedAt.has(c.id)
      ? [
          {
            id: c.id,
            ticketId: c.ticketId,
            text: c.text,
            createdAtMs: c.createdAtMs,
            atMs: c.dropped.atMs,
            reason: c.dropped.reason,
          },
        ]
      : [],
  );
  const holds = CANDIDATES.flatMap((c) => {
    const end = state.askedAt.get(c.id) ?? c.dropped?.atMs;
    return end === undefined ? [] : [{ candidateId: c.id, startMs: c.createdAtMs, endMs: end }];
  });

  return {
    durationMs: CAPTURE_END_MS,
    speech: [...state.speech].sort((a, b) => a.startMs - b.startMs),
    agentSpeech: state.agentSpeech,
    input,
    screen,
    offRecord: OFF_RECORD,
    candidates: CANDIDATES,
    asked,
    dropped,
    holds,
    learned: learned.sort((a, b) => a.atMs - b.atMs),
    lines: LINES,
    desk: DESK_BEATS,
  };
}

/** The gate's view at any session time, for the live readout. Same inputs as the simulation. */
export function captureSignalsAt(
  track: CaptureTrack,
  t: number,
): {
  signals: GateSignals;
  decision: GateDecision;
  candidate: CandidateScript | null;
} {
  const state: SimState = {
    speech: track.speech,
    agentSpeech: track.agentSpeech,
    input: track.input,
    screen: track.screen,
    offRecord: track.offRecord,
    candidates: track.candidates,
    askedAt: new Map(track.asked.map((q) => [q.candidateId, q.atMs])),
  };
  const signals = signalsFrom(state, t);
  return { signals, decision: decide(signals), candidate: activeCandidate(state, t) };
}

// ---------------------------------------------------------------------------------------------
// Playback: time-lapse while Maya works, close to real time at the pauses
// ---------------------------------------------------------------------------------------------

/** [session end of the stretch, playback length]. Session starts where the previous one ended. */
const CAPTURE_STRETCHES: [number, number][] = [
  [37_000, 2_500], // the problem, then Maya starts the session
  [46_000, 2_400], // T1 opened, she thinks aloud
  [75_000, 1_000], // types the reply
  [90_000, 6_200], // first pause, first question
  [150_000, 500],
  [183_000, 1_400], // T2
  [198_000, 6_000], // a guardrail question
  [289_000, 500],
  [298_000, 1_600], // T3 opened
  [324_000, 8_000], // she types; Shadow holds its question, then asks
  [446_000, 500],
  [473_000, 4_800], // T4: she answers before Shadow can ask
  [536_000, 1_600],
  [601_000, 2_400], // off the record
  [CAPTURE_END_MS, 1_100],
];

function buildSegments(): Segment[] {
  const out: Segment[] = [];
  let session = 0;
  let play = 0;
  for (const [end, length] of CAPTURE_STRETCHES) {
    out.push({
      sessionStartMs: session,
      sessionEndMs: end,
      playStartMs: play,
      playEndMs: play + length,
    });
    session = end;
    play += length;
  }
  return out;
}

/** Playback time for a capture session time. */
export function sessionToPlay(segments: readonly Segment[], sessionMs: number): number {
  for (const s of segments) {
    if (sessionMs <= s.sessionEndMs) {
      const f = (sessionMs - s.sessionStartMs) / (s.sessionEndMs - s.sessionStartMs);
      return s.playStartMs + Math.max(0, f) * (s.playEndMs - s.playStartMs);
    }
  }
  return segments.at(-1)?.playEndMs ?? 0;
}

/** Capture session time for a playback time (clamped to the capture chapter). */
export function playToSession(segments: readonly Segment[], playMs: number): number {
  for (const s of segments) {
    if (playMs <= s.playEndMs) {
      const f = (playMs - s.playStartMs) / (s.playEndMs - s.playStartMs);
      return s.sessionStartMs + Math.max(0, f) * (s.sessionEndMs - s.sessionStartMs);
    }
  }
  return segments.at(-1)?.sessionEndMs ?? 0;
}

/** How many times faster than real time the capture plays at this playback time. */
export function speedAt(segments: readonly Segment[], playMs: number): number {
  const s = segments.find((x) => playMs <= x.playEndMs) ?? segments.at(-1);
  if (!s) return 1;
  return (s.sessionEndMs - s.sessionStartMs) / (s.playEndMs - s.playStartMs);
}

// ---------------------------------------------------------------------------------------------
// The whole script
// ---------------------------------------------------------------------------------------------

const MAP_LENGTH_MS = 22_000;
const TEACH_LENGTH_MS = 22_000;
const AGENTS_LENGTH_MS = 5_500;

const TEACH_BACK_TEXT =
  "First I read the whole ticket. Duplicates under a hundred euros you refund yourself; bigger refunds are checked afterwards. An open chargeback is never refunded. A changed email, or a card used without permission, means stop and hand it to Security. A lawyer or GDPR goes to Legal.";
const RECHECK_TEXT =
  "So above a hundred euros, a second person approves the refund before it is sent?";

let cached: ReplayScript | null = null;

/** The replay, built once. Deterministic: the same input always gives the same script. */
export function getReplayScript(): ReplayScript {
  cached ??= buildReplayScript();
  return cached;
}

export function buildReplayScript(): ReplayScript {
  const capture = simulateCapture();
  const segments = buildSegments();
  const toPlay = (sessionMs: number) => Math.round(sessionToPlay(segments, sessionMs));
  const captureEnd = segments.at(-1)?.playEndMs ?? 0;
  const mapStart = captureEnd;
  const teachStart = mapStart + MAP_LENGTH_MS;
  const agentsStart = teachStart + TEACH_LENGTH_MS;
  const durationMs = agentsStart + AGENTS_LENGTH_MS;

  const chapters: Chapter[] = [
    {
      id: "capture",
      number: 1,
      title: "Capture",
      summary:
        "Maya triages four tickets and thinks aloud. Shadow asks only when the Turn Gate sees a real pause.",
      startMs: 0,
      endMs: captureEnd,
    },
    {
      id: "map",
      number: 2,
      title: "Map",
      summary:
        "A short debrief closes the gaps, including cases Maya never saw. She corrects Shadow once, then confirms.",
      startMs: mapStart,
      endMs: teachStart,
    },
    {
      id: "teach",
      number: 3,
      title: "Teach",
      summary:
        "Jonas, new this week, works a ticket Maya never handled. Shadow stops a wrong refund before it is saved.",
      startMs: teachStart,
      endMs: agentsStart,
    },
    {
      id: "agents",
      number: 4,
      title: "Agents",
      summary: "The same Work Map becomes a policy an AI agent can follow.",
      startMs: agentsStart,
      endMs: durationMs,
    },
  ];

  // Captions, chapter by chapter, in playback time.
  const captions: Caption[] = [];
  const say = (speaker: Speaker, text: string, startMs: number, endMs: number, extra = {}) => {
    captions.push({
      id: `cap${captions.length + 1}`,
      speaker,
      text,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      ...extra,
    });
  };

  say(
    "narrator",
    "Maya has led support escalations for nine years. None of her judgment is written down.",
    0,
    2_400,
  );
  const captureLines: { speaker: Speaker; text: string; span: Span; offRecord?: boolean }[] = [
    ...capture.lines.map((l) => ({
      speaker: "maya" as const,
      text: l.text,
      span: l,
      ...(l.offRecord ? { offRecord: true } : {}),
    })),
    ...capture.asked.flatMap((q) => {
      const c = capture.candidates.find((x) => x.id === q.candidateId);
      if (!c) return [];
      const answerStart = q.atMs + c.askMs + ANSWER_DELAY_MS;
      return [
        {
          speaker: "shadow" as const,
          text: q.text,
          span: { startMs: q.atMs, endMs: q.atMs + c.askMs },
        },
        {
          speaker: "maya" as const,
          text: c.answer.text,
          span: { startMs: answerStart, endMs: answerStart + c.answer.durationMs },
        },
      ];
    }),
  ].sort((a, b) => a.span.startMs - b.span.startMs);
  for (const l of captureLines) {
    say(l.speaker, l.text, toPlay(l.span.startMs), toPlay(l.span.endMs), {
      ...(l.offRecord ? { offRecord: true } : {}),
    });
  }

  // Map: the debrief.
  const m = (ms: number) => mapStart + ms;
  say(
    "shadow",
    "I never saw a fraud case today. If a card was used without the customer’s permission, what do you do?",
    m(600),
    m(3_000),
  );
  say("maya", "Same as a takeover. I stop, no refund, Security takes it.", m(3_200), m(6_200));
  say(
    "shadow",
    "And when a customer mentions a lawyer, or asks you to delete their data?",
    m(6_400),
    m(8_000),
  );
  say("maya", stepQuote("S6"), m(8_200), m(11_600));
  say("shadow", "A VIP asks for a refund. Macro, or your own words?", m(11_800), m(12_800));
  say("maya", "My own words. A VIP gets a person, never a template.", m(13_000), m(14_400));
  say(
    "shadow",
    "Here is how I understand your process. Tell me what I got wrong.",
    m(14_600),
    m(16_700),
  );
  say(
    "maya",
    "Not afterwards. Over a hundred, a second person approves it before it goes out.",
    m(16_900),
    m(18_900),
  );
  say("shadow", RECHECK_TEXT, m(19_000), m(20_400));
  say("maya", "Yes, that’s right.", m(20_500), m(21_400));

  // Teach: Jonas on an unseen case.
  const t = (ms: number) => teachStart + ms;
  say(
    "shadow",
    "Jonas, this one is new. Maya never handled it. What would you do?",
    t(400),
    t(2_800),
  );
  say("jonas", "Refund it. The amount is right there.", t(3_000), t(4_800));
  say("shadow", "Maya would stop here. Why do you think?", t(5_800), t(8_000));
  say("jonas", "Because it’s over a hundred?", t(8_200), t(9_600));
  say(
    "shadow",
    "That’s one. Now read the last line: the card was used without permission. Maya treats that as a takeover.",
    t(9_800),
    t(13_400),
  );
  say("jonas", "So no refund. It goes to Security.", t(13_600), t(14_800));
  say("jonas", "GDPR. That’s Legal.", t(15_600), t(16_800));
  say(
    "shadow",
    "N2 he handled alone. N1 needed one nudge, so that is what he practises next.",
    t(17_000),
    t(20_500),
  );

  say(
    "narrator",
    "Today it is one expert and one workflow. Next, every expert’s judgment, kept current for a company’s people and its agents.",
    agentsStart + 300,
    durationMs,
  );

  captions.sort((a, b) => a.startMs - b.startMs);

  // The guard's verdict on N1 -> Refund. The machine rule G1 (refund above 100 EUR) fires on the
  // amount; the judge reads "used without my permission" as the takeover signal in G3, which
  // blocks and names the route. Most severe first, as packages/guard orders them.
  const verdict: GuardVerdict = {
    decision: "BLOCK",
    ruleIds: ["G3", "G1"],
    expectedOutcome: "handoff_security",
    source: "llm_judge",
  };

  return {
    durationMs,
    chapters,
    captions,
    capture,
    segments,
    map: {
      coverage: [
        { atMs: m(0), value: 0.58 },
        { atMs: m(6_200), value: 0.71 },
        { atMs: m(11_600), value: 0.84 },
        { atMs: m(14_400), value: 0.92 },
      ],
      gaps: [
        {
          id: "gap-fraud",
          text: "A card used without the customer’s permission",
          kind: "unseen",
          askAtMs: m(600),
          answeredAtMs: m(6_200),
        },
        {
          id: "gap-legal",
          text: "A lawyer, or a request to delete data",
          kind: "unseen",
          askAtMs: m(6_400),
          answeredAtMs: m(11_600),
        },
        {
          id: "gap-vip",
          text: "Refund replies to VIP customers",
          kind: "exception",
          askAtMs: m(11_800),
          answeredAtMs: m(14_400),
        },
      ],
      steps: [
        { id: "S1", atMs: m(200) },
        { id: "S2", atMs: m(500) },
        { id: "S3", atMs: m(800) },
        { id: "S4", atMs: m(1_100) },
        { id: "S5", atMs: m(1_400) },
        { id: "S6", atMs: m(11_600) },
      ],
      teachBack: {
        showAtMs: m(14_600),
        text: TEACH_BACK_TEXT,
        correctionAtMs: m(16_900),
        recheckAtMs: m(19_000),
        recheckText: RECHECK_TEXT,
        confirmedAtMs: m(21_400),
        confirmedSessionMs: sampleWorkMap.teachBackConfirmedAtMs ?? 765_000,
      },
      clock: [
        { playMs: m(0), sessionMs: CAPTURE_END_MS },
        { playMs: m(21_400), sessionMs: sampleWorkMap.teachBackConfirmedAtMs ?? 765_000 },
        {
          playMs: m(MAP_LENGTH_MS),
          sessionMs: (sampleWorkMap.teachBackConfirmedAtMs ?? 765_000) + 3_000,
        },
      ],
    },
    teach: {
      tickets: NEW_HIRE_TICKETS,
      verdict,
      ticketId: "N1",
      attempted: "refund",
      rerouted: "handoff_security",
      predictAtMs: t(400),
      pressRefundAtMs: t(5_000),
      blockedAtMs: t(5_600),
      interventionAtMs: t(5_800),
      pressRerouteAtMs: t(15_000),
      openN2AtMs: t(15_600),
      commitN2AtMs: t(16_800),
      masteryAtMs: t(17_000),
      mastery: {
        sessionId: "replay_teach",
        workMapId: sampleWorkMap.id,
        entries: [
          { stepOrGuardrailId: "G4", status: "independent", ticketId: "N2" },
          { stepOrGuardrailId: "G3", status: "assisted", ticketId: "N1" },
        ],
        practiceNext: ["G3"],
      },
    },
  };
}
