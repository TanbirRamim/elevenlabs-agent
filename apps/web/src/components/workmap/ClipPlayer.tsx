"use client";

import type { ScreenMoment } from "@shadow/schema";
import { Pause, Play, RotateCcw, VideoOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx, IconButton } from "../ui";
import { formatClip, formatMs } from "./format";
import { frameUrl, recordingUrl } from "./load";

/**
 * Replays the session recording seeked to `moment.clip` via a media fragment (#t=start,end),
 * with its own transport: play/pause, restart, a scrubber bounded to the clip, the clip clock,
 * and a marker where the quote was said. Rendered only when a session id is known.
 */
export function ClipPlayer({
  moment,
  sessionId,
  quoteMs,
}: {
  moment: ScreenMoment;
  sessionId: string;
  /** Session time of the quote the clip backs; drawn as a marker on the scrubber. */
  quoteMs?: number;
}) {
  const [startMs, endMs] = moment.clip;
  const src = `${recordingUrl(sessionId)}#t=${startMs / 1000},${endMs / 1000}`;
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [nowMs, setNowMs] = useState(startMs);
  const [failed, setFailed] = useState(false);
  const lengthMs = Math.max(1, endMs - startMs);

  // A new clip resets the transport.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the clip changes
  useEffect(() => {
    setPlaying(false);
    setNowMs(startMs);
    setFailed(false);
  }, [src]);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.min(endMs, Math.max(startMs, ms));
      setNowMs(clamped);
      const v = ref.current;
      if (v) v.currentTime = clamped / 1000;
    },
    [startMs, endMs],
  );

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime * 1000 >= endMs - 50) v.currentTime = startMs / 1000;
      void v.play().catch(() => setFailed(true));
    } else {
      v.pause();
    }
  }, [startMs, endMs]);

  const ratio = Math.min(1, Math.max(0, (nowMs - startMs) / lengthMs));
  const quoteRatio =
    quoteMs !== undefined && quoteMs >= startMs && quoteMs <= endMs
      ? (quoteMs - startMs) / lengthMs
      : null;

  return (
    <figure className="overflow-hidden rounded-panel border border-rule bg-surface">
      <div className="relative aspect-video w-full bg-sunken">
        {/* biome-ignore lint/a11y/useMediaCaption: the session recording has no caption track; the verbatim quote shown beside the player is its transcript */}
        <video
          ref={ref}
          key={src}
          preload="metadata"
          src={src}
          poster={frameUrl(moment.frameId)}
          playsInline
          className="block size-full bg-sunken object-contain"
          aria-label={`Session clip ${formatClip(moment.clip)}`}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          onTimeUpdate={(e) => {
            const ms = e.currentTarget.currentTime * 1000;
            setNowMs(ms);
            if (ms >= endMs) e.currentTarget.pause();
          }}
        />
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-sunken p-6 text-center">
            <VideoOff aria-hidden="true" className="size-5 stroke-[1.5] text-ink-faint" />
            <p className="text-ui font-medium text-ink">The recording could not be loaded</p>
            <p className="max-w-[40ch] text-xs text-ink-muted">
              The API has no recording for session <span className="font-mono">{sessionId}</span>,
              or it is not running.
            </p>
          </div>
        ) : null}
      </div>
      <figcaption className="flex items-center gap-1 border-t border-rule px-1.5 py-1">
        <IconButton
          size="sm"
          variant="ghost"
          label={playing ? "Pause clip" : "Play clip"}
          onClick={toggle}
          disabled={failed}
        >
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          label="Restart clip"
          onClick={() => seek(startMs)}
          disabled={failed}
        >
          <RotateCcw />
        </IconButton>
        <div className="relative mx-1.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-pill bg-rule"
          >
            <span className="block h-full bg-ink" style={{ width: `${ratio * 100}%` }} />
          </span>
          {quoteRatio !== null ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-pill bg-ask"
              style={{ left: `${quoteRatio * 100}%` }}
            />
          ) : null}
          <input
            type="range"
            min={startMs}
            max={endMs}
            step={100}
            value={Math.round(Math.min(endMs, Math.max(startMs, nowMs)))}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={failed}
            aria-label="Clip position"
            aria-valuetext={`${formatMs(nowMs)}, clip ${formatClip(moment.clip)}`}
            className={cx(
              "relative block h-7 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default",
              "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-surface",
              "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink",
            )}
          />
        </div>
        <span className="figures shrink-0 pr-1.5 font-mono text-xs text-ink">
          {formatMs(nowMs)}
          <span className="text-ink-faint"> / {formatMs(endMs)}</span>
        </span>
      </figcaption>
    </figure>
  );
}
