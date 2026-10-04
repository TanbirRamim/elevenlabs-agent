"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { cx } from "../ui/cx";
import { KeyboardKey } from "../ui/Kbd";
import type { Chapter } from "./script";

export interface PlayerControlsProps {
  playMs: number;
  durationMs: number;
  playing: boolean;
  chapters: Chapter[];
  current: Chapter;
  reducedMotion: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onSeek: (ms: number) => void;
}

/** Play, pause, restart, a chapter-segmented scrubber and the keyboard map. */
export function PlayerControls({
  playMs,
  durationMs,
  playing,
  chapters,
  current,
  reducedMotion,
  onToggle,
  onRestart,
  onSeek,
}: PlayerControlsProps) {
  const ended = playMs >= durationMs;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? "Pause the replay" : ended ? "Watch again" : "Play the replay"}
          className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-canvas transition-colors duration-150 hover:bg-ink/88 [&_svg]:size-[18px]"
        >
          {playing ? (
            <Pause aria-hidden="true" />
          ) : ended ? (
            <RotateCcw aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" className="translate-x-px" />
          )}
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink [&_svg]:size-4"
        >
          <RotateCcw aria-hidden="true" />
          Restart
        </button>
        <span className="ml-auto font-mono text-[0.8125rem] text-ink-muted tabular-nums sm:hidden">
          {mss(playMs)} / {mss(durationMs)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <ol aria-label="Chapters" className="flex gap-1.5">
          {chapters.map((c) => {
            const length = c.endMs - c.startMs;
            const f = Math.min(1, Math.max(0, (playMs - c.startMs) / length));
            const isCurrent = c.id === current.id;
            return (
              <li
                key={c.id}
                className="min-w-[3.25rem] sm:min-w-[5.5rem]"
                style={{ flexGrow: length, flexBasis: 0 }}
              >
                <button
                  type="button"
                  onClick={() => onSeek(c.startMs)}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cx(
                    "flex min-h-10 w-full min-w-0 flex-col justify-end gap-1.5 text-left text-xs transition-colors duration-150 sm:text-sm",
                    isCurrent ? "text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <span className="truncate">
                    <span className="font-mono text-ink-faint">{c.number}</span>{" "}
                    <span className={c.title.length > 6 ? "max-[380px]:sr-only" : undefined}>
                      {c.title}
                    </span>
                  </span>
                  <span aria-hidden="true" className="relative block h-0.5 w-full bg-rule-strong">
                    <span
                      className="absolute inset-y-0 left-0 w-full origin-left bg-ink"
                      style={{ transform: `scaleX(${f})` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <label className="mt-1 block">
          <span className="sr-only">Replay position</span>
          <input
            type="range"
            min={0}
            max={durationMs}
            step={100}
            value={Math.round(playMs)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-valuetext={`${mss(playMs)} of ${mss(durationMs)}, chapter ${current.number}, ${current.title}`}
            className={cx(
              "block h-6 w-full cursor-pointer appearance-none bg-transparent",
              "[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-rule",
              "[&::-webkit-slider-thumb]:-mt-[7px] [&::-webkit-slider-thumb]:size-[15px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-ink",
              "[&::-moz-range-track]:h-px [&::-moz-range-track]:bg-rule",
              "[&::-moz-range-thumb]:size-[13px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-canvas [&::-moz-range-thumb]:bg-ink",
            )}
          />
        </label>
      </div>

      <div className="hidden flex-col items-end gap-1 sm:flex">
        <span className="font-mono text-[0.8125rem] text-ink tabular-nums">
          {mss(playMs)}
          <span className="text-ink-faint"> / {mss(durationMs)}</span>
        </span>
        <span className="flex items-center gap-1 text-xs text-ink-faint">
          <KeyboardKey>Space</KeyboardKey>
          <KeyboardKey aria-label="Left arrow">←</KeyboardKey>
          <KeyboardKey aria-label="Right arrow">→</KeyboardKey>
          <span className="sr-only">
            {reducedMotion
              ? "Space plays or pauses; the arrow keys step between moments."
              : "Space plays or pauses; the arrow keys move five seconds."}
          </span>
        </span>
      </div>
    </div>
  );
}

/** m:ss for the player's own clock. */
export function mss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
