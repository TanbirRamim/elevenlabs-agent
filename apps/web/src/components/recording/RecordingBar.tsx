"use client";

import { Eye, EyeOff, Pause, Play, Square } from "lucide-react";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Kbd } from "../ui/Kbd";
import { Meter } from "../ui/Progress";
import { formatElapsed } from "./logic";
import type { RecordingState } from "./RecordingStatus";

export type RecordingBarProps = {
  state: RecordingState;
  elapsedMs: number;
  /** Mic level 0..1 from the audio pipeline. Shown only while recording. */
  level?: number;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onToggleOffRecord?: () => void;
  offRecordShortcut?: readonly string[];
  className?: string;
};

const ANNOUNCE: Record<RecordingState, string> = {
  recording: "Recording",
  paused: "Recording paused",
  "off-record": "Off the record. Not recording screen or voice.",
  idle: "Not recording",
};

/**
 * The recorder's control strip: state pill, elapsed time, mic level, pause/resume, off the
 * record, stop. Off the record is a clear neutral "Not recording" state, never red.
 */
export function RecordingBar({
  state,
  elapsedMs,
  level = 0,
  onPause,
  onResume,
  onStop,
  onToggleOffRecord,
  offRecordShortcut = ["Alt", "O"],
  className,
}: RecordingBarProps) {
  const live = state === "recording";
  const offRecord = state === "off-record";
  const active = state !== "idle";

  return (
    <div
      role="toolbar"
      aria-label="Recording controls"
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-rule bg-surface px-3 py-2 shadow-raised",
        className,
      )}
    >
      <span className="sr-only" aria-live="polite">
        {ANNOUNCE[state]}
      </span>

      {live ? (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-rec-wash px-2.5 text-xs font-semibold text-rec-text">
          <span aria-hidden="true" className="size-2 rounded-full bg-rec animate-rec-pulse" />
          REC
        </span>
      ) : state === "paused" ? (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-pill border border-rule-strong px-2.5 text-xs font-medium text-ink">
          <Pause aria-hidden="true" className="size-3 stroke-2" />
          Paused
        </span>
      ) : (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-pill border border-rule bg-sunken px-2.5 text-xs font-medium text-ink-muted">
          {offRecord ? <EyeOff aria-hidden="true" className="size-3 stroke-2" /> : null}
          Not recording
          {offRecord ? <span className="text-ink-faint">(off the record)</span> : null}
        </span>
      )}

      <span
        role="timer"
        className={cx("figures font-mono text-ui", live ? "text-ink" : "text-ink-faint")}
        aria-label={`Elapsed ${formatElapsed(elapsedMs)}`}
      >
        {formatElapsed(elapsedMs)}
      </span>

      <Meter
        label="Microphone level"
        value={live ? level : 0}
        segments={12}
        tone="rec"
        className={cx("w-24", !live && "opacity-40")}
      />

      <div className="ml-auto flex items-center gap-1.5">
        {state === "paused" ? (
          <Button size="sm" variant="secondary" icon={<Play />} onClick={onResume}>
            Resume
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<Pause />} onClick={onPause} disabled={!live}>
            Pause
          </Button>
        )}
        <Button
          size="sm"
          variant={offRecord ? "primary" : "secondary"}
          icon={offRecord ? <Eye /> : <EyeOff />}
          aria-pressed={offRecord}
          onClick={onToggleOffRecord}
          disabled={!active}
          trailing={
            <span aria-hidden="true" className="hidden items-center gap-0.5 sm:inline-flex">
              {offRecordShortcut.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          }
        >
          {offRecord ? "Back on the record" : "Off the record"}
        </Button>
        <Button size="sm" variant="secondary" icon={<Square />} onClick={onStop} disabled={!active}>
          Stop
        </Button>
      </div>
    </div>
  );
}
