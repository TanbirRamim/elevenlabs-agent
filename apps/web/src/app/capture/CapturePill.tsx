"use client";

import { ChartNoAxesColumn, MessageCircleQuestion, Mic, MicOff, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { InsightNumbers } from "@/components/insight/InsightPanel";
import { VisionFeed } from "@/components/insight/VisionFeed";
import type { VisionLine } from "@/components/insight/visionLines";
import {
  ListeningIndicator,
  type ListeningState,
  PreflightChecklist,
  type PreflightItem,
  type RecordingState,
} from "@/components/recording";
import { LiveRecordingBar } from "@/components/session/LiveRecording";
import { IconButton, Tooltip } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { StartPanel } from "./parts";

/**
 * Singoda AI's entire presence while the expert works the standalone DeskSim app: a
 * Meet-style dock floating over the bottom of the screen. Before the session it
 * carries the start card and preflight; while recording it is the recording bar
 * plus the agent's status, mic mute and a one-tap insight peek. Singoda AI's latest
 * question surfaces as a callout above the dock, so the expert never leaves the
 * ticket they are working.
 */
export interface CapturePillProps {
  stage: "start" | "recording";
  // start stage
  startPanel?: {
    onStart: () => void;
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
  voiceConnected = false,
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
        <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-overlay border border-rule bg-surface p-3 shadow-overlay">
          <StartPanel
            onStart={startPanel.onStart}
            disabled={startPanel.disabled}
            busy={startPanel.busy}
            intent={startPanel.intent}
            voiceMissing={startPanel.voiceMissing}
            redactionFailed={startPanel.redactionFailed}
          />
          <PreflightChecklist
            items={startPanel.items}
            title="Before you record"
            onRetry={startPanel.onRetry}
          />
        </div>
      ) : null}

      {stage === "recording" ? (
        <div
          className={cx(
            "pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-2 rounded-overlay border bg-surface/95 p-2 shadow-overlay backdrop-blur",
            recordingState === "off-record" || recordingState === "paused"
              ? "border-rule-strong border-dashed"
              : "border-rule",
          )}
        >
          <LiveRecordingBar
            state={recordingState}
            elapsed={elapsed}
            voiceConnected={voiceConnected}
            onPause={onPause}
            onResume={onResume}
            onStop={onStop}
            onToggleOffRecord={onToggleOffRecord}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none"
          />
          <span aria-hidden="true" className="hidden h-6 w-px bg-rule sm:block" />
          <div className="flex items-center gap-1.5">
            {voiceState ? <ListeningIndicator state={voiceState} compact /> : null}
            {onToggleMic ? (
              <Tooltip content={micMuted ? "Unmute microphone" : "Mute microphone"}>
                <IconButton
                  size="sm"
                  label={micMuted ? "Unmute microphone" : "Mute microphone"}
                  aria-pressed={micMuted}
                  onClick={onToggleMic}
                  className={cx(micMuted && "bg-guard-wash text-guard-text")}
                >
                  {micMuted ? <MicOff /> : <Mic />}
                </IconButton>
              </Tooltip>
            ) : null}
            <Tooltip content="Live insight: questions, agreement, gaps">
              <IconButton
                size="sm"
                label="Live insight"
                aria-pressed={peek}
                onClick={() => setPeek((open) => !open)}
              >
                <ChartNoAxesColumn />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      ) : null}
    </div>
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
