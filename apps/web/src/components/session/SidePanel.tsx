"use client";

import { Mic, MicOff } from "lucide-react";
import dynamic from "next/dynamic";
import { Badge, type BadgeTone, Button, KeyboardKey } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { OrbFallback } from "@/components/voice/OrbFallback";
import type { OrbState } from "@/components/voice/orbState";
import { mmss, type VoiceLine, type VoiceStatus } from "@/lib/voice";
import { orbStateFor } from "./helpers";
import { Notice } from "./Notice";

const VoiceOrb = dynamic(() => import("@/components/voice/VoiceOrb"), {
  ssr: false,
  loading: () => <OrbFallback state="idle" />,
});

export interface SidePanelProps {
  status: VoiceStatus;
  mode: "speaking" | "listening";
  /** Whether the agent's audio is playing right now; drives the orb's asking state. */
  agentSpeaking?: boolean;
  offRecord: boolean;
  questionsAsked: number;
  questionBudget: number;
  transcript: VoiceLine[];
  error: string | null;
  onToggleOffRecord: () => void;
}

const ORB_CAPTION: Record<OrbState, string> = {
  idle: "Shadow joins when you share this tab and start.",
  listening: "Shadow follows the screen and your voice, and waits for a pause.",
  speaking: "A natural pause. Shadow asks one short question.",
  "off-record": "Nothing is captured or stored until you resume.",
};

/** The expert-facing panel: what Shadow is doing, what was said, and the off-the-record control. */
export function SidePanel(props: SidePanelProps) {
  const {
    status,
    mode,
    agentSpeaking = false,
    offRecord,
    questionsAsked,
    questionBudget,
    transcript,
    error,
    onToggleOffRecord,
  } = props;
  const state = agentState(status, mode, offRecord);
  const orb = orbStateFor(status, mode, agentSpeaking, offRecord);

  return (
    <aside
      aria-label="Shadow"
      className="flex flex-col rounded-panel border border-rule bg-surface lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]"
    >
      <div className="flex items-center gap-4 border-b border-rule px-5 py-5">
        <div className="size-24 shrink-0">
          <VoiceOrb state={orb} />
        </div>
        <div className="min-w-0">
          <StateBadge label={state.label} tone={state.tone} offRecord={state.offRecord} />
          <p className="mt-2 text-sm leading-snug text-ink-muted">{ORB_CAPTION[orb]}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-b border-rule px-5 py-4">
        <Button
          variant={offRecord ? "primary" : "secondary"}
          onClick={onToggleOffRecord}
          aria-pressed={offRecord}
          className="w-full justify-between"
        >
          <span className="inline-flex items-center gap-2">
            {offRecord ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
            {offRecord ? "Back on the record" : "Go off the record"}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-faint">
            <KeyboardKey>Alt</KeyboardKey>
            <span aria-hidden="true">+</span>
            <KeyboardKey>O</KeyboardKey>
          </span>
        </Button>

        <dl>
          <div className="flex items-end justify-between gap-4">
            <dt className="flex flex-col text-sm text-ink-muted">
              Questions asked
              <span className="font-mono text-xs text-ink-faint">
                at most {questionBudget} per 10 minutes
              </span>
            </dt>
            <dd className="font-display text-[2.25rem] leading-none tracking-[-0.02em] tabular-nums">
              {questionsAsked}
              <span className="text-xl text-ink-faint">/{questionBudget}</span>
            </dd>
          </div>
        </dl>
      </div>

      {error && (
        <div className="border-b border-rule px-5 py-4">
          <Notice>{error}</Notice>
        </div>
      )}

      <section aria-labelledby="conversation-title" className="flex min-h-0 flex-1 flex-col">
        <h2 id="conversation-title" className="px-5 pt-4 pb-2 text-sm font-medium text-ink-muted">
          Conversation
        </h2>
        {transcript.length === 0 ? (
          <p className="px-5 pb-5 text-[0.9375rem] leading-relaxed text-ink-faint">
            Work as you normally would and think aloud. Shadow only asks at natural pauses.
          </p>
        ) : (
          <ol className="min-h-48 flex-1 overflow-y-auto pb-2 lg:min-h-0">
            {transcript.map((line) => (
              <TranscriptLine key={line.id} line={line} />
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

function TranscriptLine({ line }: { line: VoiceLine }) {
  const agent = line.role === "agent";
  return (
    <li className="relative grid grid-cols-[3rem_1fr] gap-3 border-t border-rule px-5 py-3 first:border-t-0">
      {agent ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-signal" />
      ) : null}
      <span className="pt-0.5 font-mono text-xs text-ink-faint tabular-nums">{mmss(line.tMs)}</span>
      <div className="min-w-0">
        <p className={cx("mb-0.5 text-sm", agent ? "text-signal-text" : "text-ink-muted")}>
          {agent ? "Shadow" : "You"}
        </p>
        <p
          className={
            agent
              ? "text-[0.9375rem] leading-snug text-ink"
              : "font-display text-[1.0625rem] leading-snug text-ink italic"
          }
        >
          {line.text}
        </p>
      </div>
    </li>
  );
}

function StateBadge({
  label,
  tone,
  offRecord,
}: {
  label: string;
  tone: BadgeTone;
  offRecord: boolean;
}) {
  if (offRecord) {
    // Off the record is the one state that must never be missed: inverted ink, not a colour.
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-2.5 py-0.5 text-[0.8125rem] leading-5 font-medium text-canvas">
        <MicOff aria-hidden="true" className="size-3.5" />
        {label}
      </span>
    );
  }
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

function agentState(
  status: VoiceStatus,
  mode: "speaking" | "listening",
  offRecord: boolean,
): { label: string; tone: BadgeTone; offRecord: boolean } {
  // Off the record must read the same everywhere, so it wins over the connection state.
  if (offRecord) return { label: "Off the record", tone: "neutral", offRecord: true };
  if (status === "error") return { label: "Voice error", tone: "stop", offRecord: false };
  if (status === "connecting") return { label: "Connecting…", tone: "muted", offRecord: false };
  if (status !== "connected") return { label: "Not started", tone: "muted", offRecord: false };
  if (mode === "speaking") return { label: "Asking", tone: "signal", offRecord: false };
  return { label: "Listening quietly", tone: "signal", offRecord: false };
}
