"use client";

import { MessageCircleQuestion, MessagesSquare } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import {
  LISTENING_LABEL,
  ListeningIndicator,
  PrivacyIndicator,
  type RedactionState,
} from "@/components/recording";
import { Alert, Avatar, EmptyState, Meter } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { mmss, type VoiceLine, type VoiceStatus } from "@/lib/voice";
import type { LiveVoiceState } from "./helpers";

export interface RailQuestion {
  id: string;
  text: string;
  atMs: number;
}

export interface ShadowRailProps {
  /** Where the session is; the rail says different things before, during and after recording. */
  stage: "ready" | "recording" | "debrief";
  voice: LiveVoiceState;
  status: VoiceStatus;
  offRecord: boolean;
  paused: boolean;
  /** Questions asked in the last ten minutes, and the gate's budget for that window. */
  questionsInWindow: number;
  questionBudget: number;
  /** Time left in the gate's minimum gap after the last question. */
  gapMs: number;
  /** The question Singoda AI is asking now, shown as a callout while it is fresh. */
  current: RailQuestion | null;
  transcript: readonly VoiceLine[];
  error: string | null;
  redaction: RedactionState;
  /** A notice about the connection to the API (offline, reconnecting). */
  connection?: ReactNode;
  className?: string;
}

function caption(p: ShadowRailProps): string {
  if (p.stage === "ready") return "Singoda AI joins when the session starts.";
  if (p.status === "connecting") return "Connecting to the voice agent…";
  if (p.voice === "off")
    return p.stage === "debrief"
      ? "Voice is not connected. Type your answers to Singoda AI's questions."
      : "Voice is not connected. Singoda AI still follows the desk; you can type in the debrief.";
  if (p.voice === "asking") return "A natural pause: Singoda AI asks one short question.";
  if (p.voice === "quiet")
    return p.paused
      ? "Paused: your microphone is muted and nothing is captured."
      : "Off the record: nothing you do or say is kept until you resume.";
  return p.stage === "debrief"
    ? "Singoda AI asks what it could not learn by watching."
    : "Following the desk and your voice. Singoda AI waits for a natural pause.";
}

/**
 * The expert-facing rail: what Singoda AI is doing, the question it is asking, the question
 * budget, privacy state, and the conversation so far.
 */
export function ShadowRail(props: ShadowRailProps) {
  const {
    stage,
    voice,
    offRecord,
    questionsInWindow,
    questionBudget,
    gapMs,
    current,
    transcript,
    error,
    redaction,
    connection,
    className,
  } = props;

  return (
    <aside
      aria-label="Singoda AI"
      className={cx(
        "flex min-h-0 flex-col overflow-hidden rounded-panel border border-rule bg-surface",
        className,
      )}
    >
      <header className="flex flex-col gap-2 border-b border-rule px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name="Singoda AI" shadow size="sm" />
            <h2 className="text-ui font-semibold text-ink">Singoda AI</h2>
          </div>
          <ListeningIndicator state={voice} />
        </div>
        <p className="text-ui text-pretty text-ink-muted">{caption(props)}</p>
      </header>

      {current ? (
        <QuestionCallout key={current.id} question={current} speaking={voice === "asking"} />
      ) : null}

      {stage === "recording" ? (
        <div className="flex flex-col gap-3 border-b border-rule px-4 py-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-ink-muted">Questions</span>
              <span className="figures text-xs text-ink-muted">
                <span className="font-semibold text-ink">{questionsInWindow}</span> of{" "}
                {questionBudget} in 10 min
              </span>
            </div>
            <Meter
              label="Questions asked in the last ten minutes"
              value={questionsInWindow}
              max={questionBudget}
              segments={questionBudget}
              tone="ask"
              valueText={`${questionsInWindow} of ${questionBudget}`}
            />
            <p className="text-xs text-ink-faint">
              {gapMs > 0 ? (
                <>
                  Next question no sooner than{" "}
                  <span className="figures font-mono text-ink-muted">{mmss(gapMs)}</span>
                </>
              ) : (
                "Singoda AI asks only at a natural pause, and never while you type or talk."
              )}
            </p>
          </div>
          <PrivacyIndicator redaction={redaction} offRecord={offRecord} />
        </div>
      ) : null}

      {error || connection ? (
        <div className="flex flex-col gap-2 border-b border-rule p-3">
          {error ? (
            <Alert tone="danger" title="Voice problem">
              {error}
            </Alert>
          ) : null}
          {connection}
        </div>
      ) : null}

      <Conversation transcript={transcript} stage={stage} />
    </aside>
  );
}

function QuestionCallout({ question, speaking }: { question: RailQuestion; speaking: boolean }) {
  return (
    <section
      aria-label="Singoda AI's question"
      aria-live="polite"
      className="flex gap-3 border-b border-rule bg-ask-wash px-4 py-3 motion-safe:animate-fade-in"
    >
      <MessageCircleQuestion
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 stroke-[1.75] text-ask-text"
      />
      <div className="min-w-0">
        <p className="flex items-baseline gap-2 text-xs font-medium text-ask-text">
          {speaking ? LISTENING_LABEL.asking : "Singoda AI asked"}
          <span className="figures font-mono font-normal">{mmss(question.atMs)}</span>
        </p>
        <p className="mt-0.5 text-sm text-pretty text-ink">{question.text}</p>
      </div>
    </section>
  );
}

function Conversation({
  transcript,
  stage,
}: {
  transcript: readonly VoiceLine[];
  stage: ShadowRailProps["stage"];
}) {
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  // Follow new lines unless the reader scrolled up to look at something earlier.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll only when a line is added
  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  return (
    <section aria-labelledby="conversation-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2">
        <h2 id="conversation-title" className="text-xs font-medium text-ink-muted">
          Conversation
        </h2>
        {transcript.length > 0 ? (
          <span className="figures text-xs text-ink-faint">
            {transcript.length} {transcript.length === 1 ? "line" : "lines"}
          </span>
        ) : null}
      </div>
      {transcript.length === 0 ? (
        <div className="px-4 pb-2">
          <EmptyState
            icon={<MessagesSquare />}
            title={stage === "ready" ? "Nothing said yet" : "Listening"}
            description={
              stage === "ready"
                ? "Work the queue as you always do and think aloud. Singoda AI asks short questions at natural pauses, and each line appears here."
                : "Think aloud while you work. Your words and Singoda AI's questions appear here."
            }
            className="py-3"
          />
        </div>
      ) : (
        <ol
          ref={list}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="max-h-[28rem] min-h-0 flex-1 overflow-y-auto pb-2 lg:max-h-none"
        >
          {transcript.map((line, i) => (
            <TranscriptLine key={line.id} line={line} fresh={i === transcript.length - 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TranscriptLine({ line, fresh }: { line: VoiceLine; fresh: boolean }) {
  const shadow = line.role === "agent";
  return (
    <li
      className={cx(
        "relative grid grid-cols-[2.75rem_1fr] gap-2 px-4 py-2",
        shadow && "bg-ask-wash/60",
        fresh && "motion-safe:animate-fade-in",
      )}
    >
      {shadow ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ask" />
      ) : null}
      <time className="figures pt-0.5 font-mono text-2xs text-ink-faint">{mmss(line.tMs)}</time>
      <div className="min-w-0">
        <p className={cx("text-xs font-medium", shadow ? "text-ask-text" : "text-ink-muted")}>
          {shadow ? "Singoda AI" : "You"}
        </p>
        <p className="text-ui text-pretty text-ink">{line.text}</p>
      </div>
    </li>
  );
}
