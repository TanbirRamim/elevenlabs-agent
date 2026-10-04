"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { Button, buttonClasses } from "../ui/Button";
import { cx } from "../ui/cx";
import { Kbd } from "../ui/Kbd";
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
  const playLabel = playing ? "Pause the replay" : ended ? "Watch again" : "Play the replay";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playLabel}
          title={playLabel}
          className={buttonClasses({
            size: "md",
            iconOnly: true,
            className: "size-9 rounded-full pointer-coarse:size-10 [&_svg]:size-4",
          })}
        >
          {playing ? (
            <Pause aria-hidden="true" fill="currentColor" />
          ) : ended ? (
            <RotateCcw aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" fill="currentColor" className="translate-x-px" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRestart}
          icon={<RotateCcw aria-hidden="true" />}
        >
          Restart
        </Button>
        <span className="figures ml-auto font-mono text-xs text-ink-muted sm:hidden">
          {mss(playMs)} <span className="text-ink-faint">/ {mss(durationMs)}</span>
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <ol aria-label="Chapters" className="flex gap-1">
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
                    "group flex min-h-8 w-full min-w-0 flex-col justify-end gap-1 rounded-control text-left text-xs font-medium transition-colors duration-100 pointer-coarse:min-h-10",
                    isCurrent ? "text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <span className="truncate">
                    <span className="figures font-mono text-2xs text-ink-faint">{c.number}</span>{" "}
                    <span className={c.title.length > 6 ? "max-[380px]:sr-only" : undefined}>
                      {c.title}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative block h-1 w-full overflow-hidden rounded-pill bg-rule group-hover:bg-rule-strong"
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-pill bg-ink"
                      style={{ transform: `scaleX(${f})` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <label className="block">
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
              "block h-4 w-full cursor-pointer appearance-none bg-transparent",
              "[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-transparent",
              "[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-raised",
              "[&::-moz-range-track]:h-px [&::-moz-range-track]:bg-transparent",
              "[&::-moz-range-thumb]:size-[9px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-ink",
            )}
          />
        </label>
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        <span className="figures font-mono text-xs text-ink">
          {mss(playMs)}
          <span className="text-ink-faint"> / {mss(durationMs)}</span>
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Space</Kbd>
          <Kbd aria-label="Left arrow">←</Kbd>
          <Kbd aria-label="Right arrow">→</Kbd>
          <Kbd>1–4</Kbd>
          <span className="sr-only">
            {reducedMotion
              ? "Space plays or pauses; the arrow keys step between moments; 1 to 4 jump to an act."
              : "Space plays or pauses; the arrow keys move five seconds; 1 to 4 jump to an act."}
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
