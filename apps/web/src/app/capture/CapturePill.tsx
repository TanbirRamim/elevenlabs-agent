"use client";

import {
  ChartNoAxesColumn,
  EyeOff,
  MessageCircleQuestion,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  ScreenShare,
  ScreenShareOff,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { InsightNumbers } from "@/components/insight/InsightPanel";
import { VisionFeed } from "@/components/insight/VisionFeed";
import type { VisionLine } from "@/components/insight/visionLines";
import {
  formatElapsed,
  ListeningIndicator,
  type ListeningState,
  PreflightChecklist,
  type PreflightItem,
  type RecordingState,
} from "@/components/recording";
import { Button, IconButton, Tooltip } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { SingodaNav, StartPanel } from "./parts";

/**
 * Singoda AI's entire presence while the expert works the standalone DeskSim app: a
 * Meet-style dock floating over the bottom of the screen. Before the session it
 * carries the share card and preflight; while presenting it is a call control bar
 * (mic, off the record, pause, stop presenting, insight, end session) plus the
 * agent's status. Singoda AI's latest question surfaces as a callout above the dock,
 * so the expert never leaves the ticket they are working.
 */
export interface CapturePillProps {
  stage: "start" | "recording";
  // start stage
  startPanel?: {
    onStart: () => void;
    onShareOther: () => void;
    disabled: boolean;
    busy: boolean;
    intent: boolean;
    voiceMissing: boolean;
    redactionFailed: boolean;
    items: PreflightItem[];
    onRetry: () => void;
  };
  // recording stage
  recordingState?: RecordingState;
  elapsed?: () => number;
  /** Accepted for the demo replay's dock; the Meet-style bar shows no microphone level. */
  voiceConnected?: boolean;
  voiceState?: ListeningState;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onToggleOffRecord?: () => void;
  micMuted?: boolean;
  onToggleMic?: () => void;
  currentQuestion?: { id: string; text: string } | null;
  insight?: InsightNumbers | null;
  /** The latest events Claude read off the frames (vision screen_events), newest first. */
  visionLines?: VisionLine[];
  questionsAsked?: number;
  questionBudget?: number;
  /** Floating notices (connection loss, session problems) stacked above the dock. */
  notice?: ReactNode;
}

export function CapturePill({
  stage,
  startPanel,
  recordingState = "idle",
  elapsed = () => 0,
  voiceState,
  onPause = () => {},
  onResume = () => {},
  onStop = () => {},
  onToggleOffRecord = () => {},
  micMuted = false,
  onToggleMic,
  currentQuestion = null,
  insight = null,
  visionLines = [],
  questionsAsked = 0,
  questionBudget = 5,
  notice,
}: CapturePillProps) {
  const [peek, setPeek] = useState(false);
  const offRecord = recordingState === "off-record";
  const paused = recordingState === "paused";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {notice ? <div className="pointer-events-auto w-full max-w-md">{notice}</div> : null}

      {stage === "recording" && currentQuestion ? (
        <div
          role="status"
          className="pointer-events-auto flex max-w-md items-start gap-2 rounded-overlay border border-ask/40 bg-surface px-3.5 py-2.5 shadow-overlay motion-safe:animate-fade-in"
        >
          <MessageCircleQuestion
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 stroke-[1.75] text-ask-text"
          />
          <p className="min-w-0 text-ui text-ink">
            <span className="font-semibold text-ask-text">Singoda AI asks</span> ·{" "}
            {currentQuestion.text}
          </p>
        </div>
      ) : null}

      {stage === "recording" && peek ? (
        <section
          aria-label="Live insight"
          className="pointer-events-auto w-full max-w-md rounded-overlay border border-rule bg-surface p-3 shadow-overlay"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">Measured, live</p>
            <IconButton size="sm" label="Close insight" onClick={() => setPeek(false)}>
              <X />
            </IconButton>
          </div>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-ui">
            <InsightRow label="Questions asked">
              {questionsAsked} of {questionBudget} per 10 min
            </InsightRow>
            <InsightRow label="Vision ↔ desk agreement">
              {insight?.domVisionAgreement != null
                ? `${Math.round(insight.domVisionAgreement * 100)}%`
                : "—"}
            </InsightRow>
            <InsightRow label="Vision latency p90">
              {insight?.visionLatencyMsP90 != null
                ? `${(insight.visionLatencyMsP90 / 1000).toFixed(1)} s`
                : "—"}
            </InsightRow>
            <InsightRow label="Open gaps">{insight?.openGaps ?? "—"}</InsightRow>
          </dl>
          <div className="mt-2 border-t border-rule pt-2">
            <VisionFeed lines={visionLines} />
          </div>
        </section>
      ) : null}

      {stage === "start" && startPanel ? (
        <div className="pointer-events-auto flex max-h-[calc(100dvh-5rem)] w-full max-w-sm flex-col rounded-overlay border border-rule bg-surface shadow-overlay">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rule px-2 py-1.5">
            <SingodaNav placement="down" />
            <span className="pr-1.5 text-2xs text-ink-faint">Not presenting yet</span>
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
            <StartPanel
              onStart={startPanel.onStart}
              onShareOther={startPanel.onShareOther}
              disabled={startPanel.disabled}
              busy={startPanel.busy}
              intent={startPanel.intent}
              voiceMissing={startPanel.voiceMissing}
              redactionFailed={startPanel.redactionFailed}
            />
            <PreflightChecklist
              items={startPanel.items}
              title="Before you present"
              onRetry={startPanel.onRetry}
            />
          </div>
        </div>
      ) : null}

      {stage === "recording" ? (
        <div
          className={cx(
            "pointer-events-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-[28px] border bg-surface/95 px-2 py-1.5 shadow-overlay backdrop-blur sm:flex-nowrap",
            offRecord || paused ? "border-rule-strong border-dashed" : "border-rule",
          )}
        >
          <div className="flex min-w-0 items-center gap-2 sm:flex-1">
            <SingodaNav placement="up" showName={false} />
            <DockTimer elapsed={elapsed} state={recordingState} />
          </div>

          <div
            role="toolbar"
            aria-label="Recording controls"
            className="order-last flex w-full items-center justify-center gap-1.5 sm:order-none sm:w-auto"
          >
            {onToggleMic ? (
              <RoundButton
                label={micMuted ? "Unmute microphone" : "Mute microphone"}
                pressed={micMuted}
                tone={micMuted ? "alert" : "plain"}
                onClick={onToggleMic}
              >
                {micMuted ? <MicOff /> : <Mic />}
              </RoundButton>
            ) : null}
            <RoundButton
              label={offRecord ? "Back on the record" : "Go off the record"}
              tooltip={offRecord ? "Back on the record" : "Off the record: capture nothing"}
              shortcut={["Alt", "O"]}
              pressed={offRecord}
              tone={offRecord ? "active" : "plain"}
              onClick={onToggleOffRecord}
            >
              <EyeOff />
            </RoundButton>
            <RoundButton
              label={paused ? "Resume recording" : "Pause recording"}
              pressed={paused}
              tone={paused ? "active" : "plain"}
              onClick={paused ? onResume : onPause}
              disabled={offRecord}
            >
              {paused ? <Play /> : <Pause />}
            </RoundButton>
            <RoundButton
              label="Stop presenting"
              tooltip="Stop presenting and go to the debrief"
              tone="presenting"
              onClick={onStop}
            >
              <ScreenShareOff />
            </RoundButton>
            <RoundButton
              label="Live insight"
              tooltip="Live insight: questions, agreement, gaps"
              pressed={peek}
              tone={peek ? "selected" : "plain"}
              onClick={() => setPeek((open) => !open)}
            >
              <ChartNoAxesColumn />
            </RoundButton>
          </div>

          <div className="flex items-center justify-end gap-2 sm:flex-1">
            {voiceState ? <ListeningIndicator state={voiceState} compact /> : null}
            <Tooltip content="End the session and go to the debrief">
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-danger-fill px-4 text-ui font-medium text-white shadow-raised transition-colors hover:bg-danger-fill/90 [&_svg]:size-[18px] [&_svg]:stroke-[1.75]"
              >
                <PhoneOff aria-hidden="true" />
                End session
              </button>
            </Tooltip>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Meet's "You are presenting" bar, in the page flow above the app so it is never inside the
 * captured DeskSim region. The thumbnail plays the redacted stream: exactly what is kept.
 */
export function PresentingBanner({
  thisTab,
  preview,
  onStop,
}: {
  thisTab: boolean;
  preview: MediaStream | null;
  onStop: () => void;
}) {
  return (
    <section
      aria-label="Presenting"
      className="flex shrink-0 items-center gap-3 border-b border-rule bg-sunken px-3 py-1.5 sm:px-4"
    >
      <PreviewThumb stream={preview} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-1.5 truncate text-ui font-medium text-ink">
          <ScreenShare
            aria-hidden="true"
            className="size-4 shrink-0 stroke-[1.75] text-ink-muted"
          />
          You are presenting to Singoda AI
        </p>
        <p className="truncate text-2xs text-ink-faint">
          {thisTab
            ? "This tab. Only DeskSim is kept, personal data blacked out."
            : "Not this tab, so nothing is kept. End and share this tab to record."}
        </p>
      </div>
      <Button size="sm" variant="secondary" icon={<ScreenShareOff />} onClick={onStop}>
        <span className="hidden sm:inline">Stop presenting</span>
        <span className="sm:hidden">Stop</span>
      </Button>
    </section>
  );
}

function PreviewThumb({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) void v.play().catch(() => {});
    return () => {
      v.srcObject = null;
    };
  }, [stream]);
  return (
    <div className="relative hidden h-9 w-16 shrink-0 overflow-hidden rounded-[6px] border border-rule bg-ink min-[400px]:block">
      <video
        ref={ref}
        muted
        playsInline
        aria-label="Preview of what Singoda AI keeps"
        className="size-full object-contain"
      />
    </div>
  );
}

type Tone = "plain" | "alert" | "active" | "selected" | "presenting";

const TONES: Record<Tone, string> = {
  plain: "border-rule bg-surface text-ink hover:bg-hover",
  alert: "border-transparent bg-danger-fill text-white hover:bg-danger-fill/90",
  active: "border-transparent bg-ink text-ink-inverse hover:bg-ink/85",
  selected: "border-transparent bg-selected text-ink hover:bg-hover",
  presenting: "border-transparent bg-brand-wash text-brand-text hover:bg-hover",
};

/** A Meet-style round control: icon only, the name in a tooltip and for screen readers. */
function RoundButton({
  label,
  tooltip,
  shortcut,
  pressed,
  tone = "plain",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tooltip?: string;
  shortcut?: readonly string[];
  pressed?: boolean;
  tone?: Tone;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={tooltip ?? label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[18px] [&_svg]:stroke-[1.75]",
          TONES[tone],
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const STATE_LABEL: Record<RecordingState, string> = {
  idle: "Not recording",
  recording: "Recording",
  "off-record": "Off the record",
  paused: "Paused",
};

/** Elapsed recorded time with the state dot, ticking while the session runs. */
function DockTimer({ elapsed, state }: { elapsed: () => number; state: RecordingState }) {
  const read = useRef(elapsed);
  read.current = elapsed;
  const [ms, setMs] = useState(() => elapsed());
  useEffect(() => {
    setMs(read.current());
    if (state === "idle") return;
    const id = setInterval(() => setMs(read.current()), 500);
    return () => clearInterval(id);
  }, [state]);
  const live = state === "recording";
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-ui">
      <span
        aria-hidden="true"
        className={cx(
          "size-2 shrink-0 rounded-full",
          live ? "bg-rec motion-safe:animate-rec-pulse" : "bg-ink-faint",
        )}
      />
      <span
        role="timer"
        aria-label={`Elapsed ${formatElapsed(ms)}`}
        className="font-mono text-ink tabular-nums"
      >
        {formatElapsed(ms)}
      </span>
      <span className="hidden truncate text-xs text-ink-muted md:inline">{STATE_LABEL[state]}</span>
    </span>
  );
}

function InsightRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-2xs text-ink-faint">{label}</dt>
      <dd className="figures text-ink">{children}</dd>
    </div>
  );
}
