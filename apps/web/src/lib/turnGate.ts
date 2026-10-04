/**
 * Turn Gate: decides WHEN Shadow may speak. Pure and deterministic so it can be unit-tested
 * and shown live in the judge debug panel. The LLM decides HOW to ask, never WHEN.
 */
export interface GateSignals {
  nowMs: number;
  lastUserSpeechMs: number | null;
  lastInputActivityMs: number | null; // DeskSim keystrokes/clicks
  lastScreenChangeMs: number | null; // pHash changed
  agentSpeaking: boolean;
  offRecord: boolean;
  questionsAskedMs: number[]; // timestamps of questions already asked
  candidate: { priority: number; createdAtMs: number } | null;
}

export interface GateConfig {
  silenceMs: number;
  inputIdleMs: number;
  screenIdleMs: number;
  minGapMs: number;
  maxPer10Min: number;
  minPriority: number;
  candidateTtlMs: number;
}

export const DEFAULT_GATE: GateConfig = {
  silenceMs: 1500,
  inputIdleMs: 3000,
  screenIdleMs: 2500,
  // 30 s, not 90: the demo works four tickets in about 2:30 and must reach 3+ questions; with
  // a 90 s gap and a 20 s candidate TTL, a ticket's question went stale before the gap opened.
  // The budget below still caps a session at 5 questions per 10 minutes.
  minGapMs: 30_000,
  maxPer10Min: 5,
  minPriority: 0.6,
  candidateTtlMs: 20_000,
};

export type GateDecision =
  | { open: true }
  | {
      open: false;
      reason:
        | "off_record"
        | "agent_speaking"
        | "user_speaking"
        | "user_typing"
        | "screen_changing"
        | "no_candidate"
        | "low_priority"
        | "stale_candidate"
        | "too_soon"
        | "budget_spent";
    };

const idleFor = (now: number, last: number | null, ms: number) => last === null || now - last >= ms;

export function decide(s: GateSignals, c: GateConfig = DEFAULT_GATE): GateDecision {
  if (s.offRecord) return { open: false, reason: "off_record" };
  if (s.agentSpeaking) return { open: false, reason: "agent_speaking" };
  if (!idleFor(s.nowMs, s.lastUserSpeechMs, c.silenceMs))
    return { open: false, reason: "user_speaking" };
  if (!idleFor(s.nowMs, s.lastInputActivityMs, c.inputIdleMs))
    return { open: false, reason: "user_typing" };
  if (!idleFor(s.nowMs, s.lastScreenChangeMs, c.screenIdleMs))
    return { open: false, reason: "screen_changing" };
  if (!s.candidate) return { open: false, reason: "no_candidate" };
  if (s.candidate.priority < c.minPriority) return { open: false, reason: "low_priority" };
  if (s.nowMs - s.candidate.createdAtMs > c.candidateTtlMs)
    return { open: false, reason: "stale_candidate" };
  const last = s.questionsAskedMs.at(-1);
  if (last !== undefined && s.nowMs - last < c.minGapMs) return { open: false, reason: "too_soon" };
  const recent = s.questionsAskedMs.filter((t) => s.nowMs - t < 600_000).length;
  if (recent >= c.maxPer10Min) return { open: false, reason: "budget_spent" };
  return { open: true };
}
