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
 * record reference, so capture also works on software Shadow has no ticket list for.
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
  let stopped = false;

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
      const dead = recencyOf(gap, now) === 0 && gap.answerSegmentIds.length === 0;
      if (dead) {
        decayed.push(gap);
        gaps.splice(i, 1);
        // Write through so /sessions/:id/end can ask it in the debrief.
        session.debriefQueue.push({
          id: gap.id,
          slot: gap.slot,
          text:
            gap.questionText ??
            `On ${gap.ticketId}, what is the ${gap.slot.replace("_", " ")} behind the ${gap.outcome} decision?`,
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
    let top: Gap | undefined;
    let topPriority = 0;
    for (const gap of open) {
      const p = priorityOf(gap, { nowMs: lastTMs, screenAnswers: answers });
      if (p > topPriority) {
        top = gap;
        topPriority = p;
      }
    }
    if (!top || topPriority < CANDIDATE_THRESHOLD || top.id === candidateGapId) return;
    const gap = top;
    const priority = topPriority;
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
      if (gap) gap.askedAtMs = tMs;
      if (candidateGapId === gap?.id) candidateGapId = null;
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
