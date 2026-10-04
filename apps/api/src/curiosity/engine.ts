import { curiosity } from "@shadow/prompts";
import type {
  CandidateQuestion,
  DeskEvent,
  Outcome,
  PublicTicket,
  ServerMessage,
  TranscriptSegment,
} from "@shadow/schema";
import { z } from "zod";
import { type LlmDeps, LlmError, structured } from "../llm/structured.js";
import type { VisionEvent } from "../pipeline/frames.js";
import { outcomeFromText } from "../pipeline/metrics.js";
import type { SessionRecord } from "../store/memory.js";
import { type Gap, gapsForDecision, priorityOf, recencyOf } from "./ledger.js";

const ANSWER_WINDOW_MS = 30_000;
const CANDIDATE_THRESHOLD = 0.6;
/** Live questions a session must reach (challenge brief); below it the coverage policy runs. */
const LIVE_QUOTA = 3;
/** Coverage policy floor: any on-screen gap worth a question (T1 reply guardrail scores 0.5). */
const QUOTA_THRESHOLD = 0.2;
/** Coverage policy: an old gap keeps half its weight instead of decaying to nothing. */
const QUOTA_RECENCY_FLOOR = 0.5;
/** Re-offer an unasked candidate this long after it was sent (the client's TTL is 45 s). */
const REOFFER_AFTER_MS = 20_000;
/** Debrief priority for gaps the live session never got to ask (ahead of the map's own). */
const SHORTFALL_PRIORITY = 0.95;
const PhrasedQuestion = z.object({ text: z.string().max(160) });

export interface AnsweredQuestion {
  gapId: string;
  ticketId: string;
  slot: Gap["slot"];
  question: string;
  answerSegmentIds: string[];
}

export interface CuriosityEngine {
  /** DeskSim DOM event; app.ts only routes these here when capture signals are "vision+desk". */
  onDeskEvent(event: DeskEvent): void;
  /** One event vision read off a frame: the primary signal (works for any app on screen). */
  onVisionEvent(event: VisionEvent, tMs: number): void;
  /** Vision saw a decision forming with no matching DOM action (§6.5). */
  onVisionDecision(tMs: number): void;
  onQuestionAsked(questionId: string, tMs: number): void;
  onTranscript(segment: TranscriptSegment): void;
  openGapCount(): number;
  /** Decayed or never-asked gaps, for the debrief (HAR-9). */
  debriefQueue(): Gap[];
  answeredQuestions(): AnsweredQuestion[];
  stop(): void;
}

export interface CuriosityDeps {
  session: SessionRecord;
  send: (m: ServerMessage) => void;
  llm: LlmDeps | null;
  ticketsById: ReadonlyMap<string, PublicTicket>;
  screenAnswers: () => readonly string[];
  log: { warn: (obj: object, msg: string) => void };
  evaluateIntervalMs?: number;
  /** Live questions to reach before the 0.6 bar and decay apply (default 3; tests: 0). */
  liveQuota?: number;
  /** Test seam: phrase a gap into question text (default: the curiosity route). */
  phrase?: (gap: Gap, context: PhraseContext) => Promise<string>;
}

interface PhraseContext {
  ticket: PublicTicket | undefined;
  screenAnswers: readonly string[];
  recentExpertLines: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A record reference in an unknown app: "ticket 4512", "case #88", "INC-2041". */
const GENERIC_RECORD_ID =
  /\b(?:ticket|case|issue|request|incident)\s*#?\s*([a-z]{0,6}-?\d{1,8})\b|#(\d{2,8})\b|\b([A-Z]{2,6}-\d{1,8})\b/i;

/**
 * The record a vision text is about: a known ticket id first (longest wins), else a generic
 * record reference, so capture also works on software Singoda AI has no ticket list for.
 */
export function recordIdIn(text: string, knownIds: Iterable<string>): string | null {
  let best: string | null = null;
  for (const id of knownIds) {
    if (best && id.length <= best.length) continue;
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(id)}($|[^a-z0-9])`, "i").test(text)) best = id;
  }
  if (best) return best;
  const m = GENERIC_RECORD_ID.exec(text);
  const id = m?.[1] ?? m?.[2] ?? m?.[3];
  return id ? id.toUpperCase() : null;
}

export function createCuriosityEngine({
  session,
  send,
  llm,
  ticketsById,
  screenAnswers,
  log,
  evaluateIntervalMs = 2000,
  liveQuota = LIVE_QUOTA,
  phrase,
}: CuriosityDeps): CuriosityEngine {
  const gaps: Gap[] = [];
  const decayed: Gap[] = [];
  let nextGapN = 0;
  let nextQuestionN = 0;
  let lastTMs = 0;
  /** Last committed decision from any signal (vision action or, in vision+desk, DOM). */
  let lastActionTMs = -Infinity;
  /** ticketId|outcome already opened: vision reports one action across several frames. */
  const decided = new Set<string>();
  let lastOpenedTicketId: string | null = null;
  let phrasing = false;
  let candidateGapId: string | null = null;
  let candidate: CandidateQuestion | null = null;
  let candidateSentAtMs = 0;
  /** Tickets a live question was asked about, and how many were asked. */
  const askedTickets = new Set<string>();
  let askedCount = 0;
  let guardrailAsked = false;
  /** Gap ids currently written to session.debriefQueue as the live shortfall. */
  const shortfallIds = new Set<string>();
  /** Shortfall gaps the debrief already took off the queue (answered): never re-queued or asked. */
  const consumed = new Set<string>();
  let stopped = false;

  const behindQuota = () => askedCount < liveQuota;
  const fallbackText = (gap: Gap) =>
    `On ${gap.ticketId}, what is the ${gap.slot.replace("_", " ")} behind the ${gap.outcome} decision?`;

  /**
   * Minimum coverage (until the quota is met): one question per decided ticket, a guardrail
   * first, an old gap keeps half its weight. Screen-answerable gaps still score 0.
   */
  function coverageScore(gap: Gap, answers: readonly string[]): number {
    const fresh = priorityOf(gap, { nowMs: lastTMs, screenAnswers: answers });
    const floored = priorityOf(gap, {
      nowMs: Math.min(lastTMs, gap.openedAtMs + (1 - QUOTA_RECENCY_FLOOR) * 60_000),
      screenAnswers: answers,
    });
    let score = Math.max(fresh, floored);
    if (askedTickets.has(gap.ticketId)) score *= 0.25;
    if (!guardrailAsked && gap.slot === "guardrail") score = Math.min(1, score * 1.25);
    return score;
  }

  /** Keeps the top unasked gaps at the front of the debrief while the live quota is short. */
  function syncShortfall(open: Gap[], answers: readonly string[]) {
    for (const id of shortfallIds) {
      if (!session.debriefQueue.some((q) => q.id === id)) consumed.add(id);
    }
    const missing = Math.max(0, liveQuota - askedCount);
    const top = missing
      ? open
          .filter((g) => !consumed.has(g.id))
          .map((g) => ({ g, s: coverageScore(g, answers) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, missing)
          .map((x) => x.g)
      : [];
    const want = new Set(top.map((g) => g.id));
    session.debriefQueue = session.debriefQueue.filter(
      (q) => !shortfallIds.has(q.id) || want.has(q.id),
    );
    for (const id of [...shortfallIds]) if (!want.has(id)) shortfallIds.delete(id);
    for (const gap of top) {
      const text = gap.questionText ?? fallbackText(gap);
      const existing = session.debriefQueue.find((q) => q.id === gap.id);
      if (existing) existing.text = text;
      else
        session.debriefQueue.push({
          id: gap.id,
          slot: gap.slot,
          text,
          priority: SHORTFALL_PRIORITY,
        });
      shortfallIds.add(gap.id);
    }
  }

  const defaultPhrase = async (gap: Gap, ctx: PhraseContext): Promise<string> => {
    if (!llm) throw new LlmError("refusal", curiosity.version);
    const out = await structured(llm, curiosity, PhrasedQuestion, [
      {
        type: "text",
        text: JSON.stringify({
          ticket: ctx.ticket
            ? {
                id: ctx.ticket.id,
                subject: ctx.ticket.subject,
                tags: ctx.ticket.tags,
                amountEur: ctx.ticket.amountEur,
              }
            : { id: gap.ticketId },
          decision: gap.outcome,
          unfilledSlot: gap.slot,
          screenAnswers: ctx.screenAnswers,
          expertAlreadySaid: ctx.recentExpertLines,
        }),
      },
    ]);
    return out.text;
  };
  const phraseFn = phrase ?? defaultPhrase;

  function bump(tMs: number) {
    if (tMs > lastTMs) lastTMs = tMs;
  }

  function commitDecision(ticketId: string, outcome: Outcome, tMs: number) {
    lastActionTMs = Math.max(lastActionTMs, tMs);
    const key = `${ticketId}|${outcome}`;
    if (decided.has(key)) return;
    decided.add(key);
    gaps.push(
      ...gapsForDecision(ticketsById.get(ticketId), ticketId, outcome, tMs, () => {
        nextGapN += 1;
        return `gap_${nextGapN}`;
      }),
    );
    evaluate();
  }

  function openGaps(): Gap[] {
    const now = lastTMs;
    for (let i = gaps.length - 1; i >= 0; i -= 1) {
      const gap = gaps[i];
      if (!gap) continue;
      // Before the live quota is met an unasked gap stays open (the coverage policy may still
      // ask it); the shortfall keeps it at the front of the debrief meanwhile.
      const dead =
        recencyOf(gap, now) === 0 &&
        gap.answerSegmentIds.length === 0 &&
        !(behindQuota() && gap.askedAtMs === undefined);
      if (dead) {
        decayed.push(gap);
        gaps.splice(i, 1);
        // Write through so /sessions/:id/end can ask it in the debrief.
        session.debriefQueue.push({
          id: gap.id,
          slot: gap.slot,
          text: gap.questionText ?? fallbackText(gap),
          priority: 0.7,
        });
      }
    }
    return gaps.filter((g) => g.answerSegmentIds.length === 0 && g.askedAtMs === undefined);
  }

  function evaluate() {
    if (stopped || phrasing) return;
    const answers = screenAnswers();
    const open = openGaps();
    const behind = behindQuota();
    syncShortfall(open, answers);
    let top: Gap | undefined;
    let topPriority = 0;
    for (const gap of open) {
      if (consumed.has(gap.id)) continue;
      const p = behind
        ? coverageScore(gap, answers)
        : priorityOf(gap, { nowMs: lastTMs, screenAnswers: answers });
      if (p > topPriority) {
        top = gap;
        topPriority = p;
      }
    }
    if (!top || topPriority < (behind ? QUOTA_THRESHOLD : CANDIDATE_THRESHOLD)) return;
    if (top.id === candidateGapId) {
      // The expert talked through the pause and the client let it go stale: offer it again.
      if (behind && candidate && lastTMs - candidateSentAtMs >= REOFFER_AFTER_MS) {
        candidate = { ...candidate, createdAtMs: lastTMs };
        candidateSentAtMs = lastTMs;
        send({ type: "candidate_question", question: candidate });
      }
      return;
    }
    const gap = top;
    const priority = Math.min(1, topPriority);
    phrasing = true;
    void phraseFn(gap, {
      ticket: ticketsById.get(gap.ticketId),
      screenAnswers: answers,
      recentExpertLines: session.transcript
        .filter((s) => s.speaker === "expert")
        .slice(-3)
        .map((s) => s.text),
    })
      .then((text) => {
        if (stopped) return;
        nextQuestionN += 1;
        const question: CandidateQuestion = {
          id: `q_${nextQuestionN}`,
          text: text.slice(0, 160),
          slot: gap.slot,
          priority,
          aboutTicketId: gap.ticketId,
          createdAtMs: lastTMs,
        };
        gap.questionId = question.id;
        gap.questionText = question.text;
        candidateGapId = gap.id;
        candidate = question;
        candidateSentAtMs = lastTMs;
        const shortfall = session.debriefQueue.find((q) => q.id === gap.id);
        if (shortfall) shortfall.text = question.text;
        send({ type: "candidate_question", question });
      })
      .catch((err: unknown) => {
        log.warn(
          { sessionId: session.id, gapId: gap.id, err: String(err) },
          "curiosity phrasing failed",
        );
      })
      .finally(() => {
        phrasing = false;
      });
  }

  const interval = setInterval(evaluate, evaluateIntervalMs);

  return {
    onDeskEvent(event) {
      bump(event.tMs);
      if (event.type === "ticket_opened") lastOpenedTicketId = event.ticketId;
      if (event.type === "action_committed")
        commitDecision(event.ticketId, event.outcome, event.tMs);
    },
    onVisionEvent(event, tMs) {
      bump(tMs);
      const text = [event.object, event.field, event.from, event.to, event.fact]
        .filter(Boolean)
        .join(" ");
      const recordId = recordIdIn(text, ticketsById.keys());
      if (event.kind === "opened") {
        if (recordId) lastOpenedTicketId = recordId;
        return;
      }
      if (event.kind !== "action") return;
      const ticketId = recordId ?? lastOpenedTicketId;
      const outcome = outcomeFromText(text);
      if (!ticketId || !outcome) return;
      lastOpenedTicketId = ticketId;
      commitDecision(ticketId, outcome, tMs);
    },
    onVisionDecision(tMs) {
      bump(tMs);
      // Only when no committed action explains it and we know which ticket is on screen.
      if (Math.abs(tMs - lastActionTMs) <= 5000 || !lastOpenedTicketId) return;
      const ticketId = lastOpenedTicketId;
      if (gaps.some((g) => g.ticketId === ticketId && recencyOf(g, lastTMs) > 0)) return;
      gaps.push(
        ...gapsForDecision(ticketsById.get(ticketId), ticketId, "reply", tMs, () => {
          nextGapN += 1;
          return `gap_${nextGapN}`;
        }),
      );
      evaluate();
    },
    onQuestionAsked(questionId, tMs) {
      bump(tMs);
      const gap = gaps.find((g) => g.questionId === questionId);
      if (!gap || gap.askedAtMs !== undefined) return;
      gap.askedAtMs = tMs;
      askedCount += 1;
      askedTickets.add(gap.ticketId);
      if (gap.slot === "guardrail") guardrailAsked = true;
      if (candidateGapId === gap.id) {
        candidateGapId = null;
        candidate = null;
      }
      syncShortfall(openGaps(), screenAnswers());
    },
    onTranscript(segment) {
      bump(segment.tEndMs);
      if (segment.speaker !== "expert") return;
      for (const gap of gaps) {
        if (gap.askedAtMs === undefined) continue;
        if (
          segment.tStartMs >= gap.askedAtMs &&
          segment.tStartMs <= gap.askedAtMs + ANSWER_WINDOW_MS
        ) {
          gap.answerSegmentIds.push(segment.id);
          // Write through so the work map builder sees answers after disconnect.
          const existing = session.answeredQuestions.find(
            (a) => a.question === gap.questionText && a.ticketId === gap.ticketId,
          );
          if (existing) {
            existing.answerSegmentIds.push(segment.id);
          } else {
            session.answeredQuestions.push({
              ticketId: gap.ticketId,
              slot: gap.slot,
              question: gap.questionText ?? "",
              answerSegmentIds: [segment.id],
            });
          }
        }
      }
      evaluate();
    },
    openGapCount: () => openGaps().length,
    debriefQueue: () => {
      openGaps(); // sweep decayed
      return [...decayed];
    },
    answeredQuestions: () =>
      gaps
        .filter((g) => g.answerSegmentIds.length > 0)
        .map((g) => ({
          gapId: g.id,
          ticketId: g.ticketId,
          slot: g.slot,
          question: g.questionText ?? "",
          answerSegmentIds: [...g.answerSegmentIds],
        })),
    stop() {
      stopped = true;
      clearInterval(interval);
    },
  };
}
