import { curiosity } from "@shadow/prompts";
import type {
  CandidateQuestion,
  DeskEvent,
  PublicTicket,
  ServerMessage,
  TranscriptSegment,
} from "@shadow/schema";
import { z } from "zod";
import { type LlmDeps, LlmError, structured } from "../llm/structured.js";
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
  onDeskEvent(event: DeskEvent): void;
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
  let lastDomActionTMs = -Infinity;
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

  function openFor(ticketId: string, outcome: DeskEvent & { type: "action_committed" }) {
    gaps.push(
      ...gapsForDecision(ticketsById.get(ticketId), ticketId, outcome.outcome, outcome.tMs, () => {
        nextGapN += 1;
        return `gap_${nextGapN}`;
      }),
    );
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
      if (event.type === "action_committed") {
        lastDomActionTMs = event.tMs;
        openFor(event.ticketId, event);
        evaluate();
      }
    },
    onVisionDecision(tMs) {
      bump(tMs);
      // Only when no DOM action explains it and we know which ticket is on screen.
      if (Math.abs(tMs - lastDomActionTMs) <= 5000 || !lastOpenedTicketId) return;
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
