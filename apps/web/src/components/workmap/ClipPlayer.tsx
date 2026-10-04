"use client";

import type { ScreenMoment } from "@shadow/schema";
import { Film, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx, IconButton } from "../ui";
import { formatClip, formatMs } from "./format";
import {
  framesAroundMoment,
  frameUrl,
  type RecordingState,
  type ReplayMode,
  recordingUrl,
  replayMode,
} from "./load";

/** The honest line shown where a screen replay would be when there is nothing to play. */
export const NO_REPLAY_NOTE = "Screen replay appears for maps captured in a live session.";

const SLIDE_MS = 1_500;

/**
 * Checks which of `frameIds` the API has stored for `sessionId` by loading each as an image.
 * Returns "pending" until every probe has answered; a null session probes nothing.
 */
export function useStoredFrames(
  sessionId: string | null,
  frameIds: readonly string[],
): readonly string[] | "pending" {
  const key = frameIds.join("|");
  const [result, setResult] = useState<{ key: string; ok: string[] } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for frameIds
  useEffect(() => {
    if (!sessionId || frameIds.length === 0) return;
    let cancelled = false;
    const probes = frameIds.map(
      (id) =>
        new Promise<string | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(id);
          img.onerror = () => resolve(null);
          img.src = frameUrl(sessionId, id);
        }),
    );
    void Promise.all(probes).then((ids) => {
      if (!cancelled) setResult({ key: `${sessionId}#${key}`, ok: ids.filter((x) => x !== null) });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, key]);
  if (!sessionId || frameIds.length === 0) return [];
  return result?.key === `${sessionId}#${key}` ? result.ok : "pending";
}

/**
 * Decides how a moment is replayed: the recording first; if it fails, the stored redacted
 * frames around the moment (from `nearby`, the map's other moments); else the quote alone.
 * Frames are only probed once the recording has failed.
 */
export function useScreenReplay(
  sessionId: string | null,
  moment: ScreenMoment | null,
  nearby: readonly ScreenMoment[],
) {
  const [recording, setRecording] = useState<RecordingState>("pending");
  const candidates = useMemo(
    () => (moment ? framesAroundMoment(moment, nearby) : []),
    [moment, nearby],
  );
  const stored = useStoredFrames(
    recording === "missing" ? sessionId : null,
    candidates.map((c) => c.frameId),
  );
  const frames = recording !== "missing" ? "pending" : stored === "pending" ? "pending" : stored;
  const mode: ReplayMode = replayMode({ sessionId, recording, frames });
  const slides = frames === "pending" ? [] : candidates.filter((c) => frames.includes(c.frameId));
  const reset = useCallback(() => setRecording("pending"), []);
  const onVideoReady = useCallback(() => setRecording("ok"), []);
  const onVideoError = useCallback(() => setRecording("missing"), []);
  return { mode, slides, reset, onVideoReady, onVideoError };
}

/**
 * The screen moment as a slideshow of the session's stored, redacted frames, for a session
 * whose recording is missing. Advances on its own (when `autoPlay`) with its own play/pause.
 */
export function FrameSlideshow({
  sessionId,
  slides,
  clip,
  autoPlay = false,
}: {
  sessionId: string;
  slides: readonly { frameId: string; tMs: number }[];
  clip: [number, number];
  autoPlay?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay && slides.length > 1);
  const count = slides.length;
  useEffect(() => {
    if (!playing || count < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [playing, count]);
  const current = slides[Math.min(index, count - 1)];
  if (!current) return null;
  return (
    <figure
      aria-label={`Session clip ${formatClip(clip)}, stored frames`}
      className="overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <div className="relative aspect-video w-full bg-sunken">
        {/* biome-ignore lint/performance/noImgElement: frames come from the API host; next/image would need remotePatterns in next.config.ts, which this component does not own */}
        <img
          src={frameUrl(sessionId, current.frameId)}
          alt={`Redacted screen at ${formatMs(current.tMs)}`}
          className="block size-full object-contain"
        />
      </div>
      <figcaption className="flex items-center gap-1 border-t border-rule px-1.5 py-1">
        {count > 1 ? (
          <IconButton
            size="sm"
            variant="ghost"
            label={playing ? "Pause frames" : "Play frames"}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause /> : <Play />}
          </IconButton>
        ) : null}
        <span className="min-w-0 flex-1 px-1.5 text-xs text-ink-muted">
          {count > 1 ? `Frame ${index + 1} of ${count}` : "Stored frame"} · redacted, no recording
          for this session
        </span>
        <span className="figures shrink-0 pr-1.5 font-mono text-xs text-ink">
          {formatMs(current.tMs)}
        </span>
      </figcaption>
    </figure>
  );
}

/** Where the replay would be when neither a recording nor stored frames exist. */
export function NoReplayNote({ clip }: { clip?: [number, number] }) {
  return (
    <div
      role="note"
      aria-label={clip ? `Session clip ${formatClip(clip)}, no screen replay` : "No screen replay"}
      className="flex w-full items-start gap-2 rounded-panel border border-rule bg-sunken p-3"
    >
      <Film aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[1.5] text-ink-muted" />
      <p className="text-ui text-ink-muted">{NO_REPLAY_NOTE}</p>
    </div>
  );
}

/**
 * Replays the session recording seeked to `moment.clip` via a media fragment (#t=start,end),
 * with its own transport: play/pause, restart, a scrubber bounded to the clip, the clip clock,
 * and a marker where the quote was said. Without a recording it shows the stored frames around
 * the moment, and without those an honest note. Rendered only when a session id is known.
 */
export function ClipPlayer({
  moment,
  sessionId,
  quoteMs,
  nearby = [],
}: {
  moment: ScreenMoment;
  sessionId: string;
  /** Session time of the quote the clip backs; drawn as a marker on the scrubber. */
  quoteMs?: number;
  /** Other moments of the map, whose frames may join the slideshow when there is no recording. */
  nearby?: readonly ScreenMoment[];
}) {
  const replay = useScreenReplay(sessionId, moment, nearby);
  const [startMs, endMs] = moment.clip;
  const src = `${recordingUrl(sessionId)}#t=${startMs / 1000},${endMs / 1000}`;
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [nowMs, setNowMs] = useState(startMs);
  const failed = replay.mode !== "video";
  const { reset } = replay;
  const lengthMs = Math.max(1, endMs - startMs);

  // A new clip resets the transport.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the clip changes
  useEffect(() => {
    setPlaying(false);
    setNowMs(startMs);
    reset();
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
      void v.play().catch(() => replay.onVideoError());
    } else {
      v.pause();
    }
  }, [startMs, endMs, replay.onVideoError]);

  if (replay.mode === "slideshow") {
    return <FrameSlideshow sessionId={sessionId} slides={replay.slides} clip={moment.clip} />;
  }
  if (replay.mode === "quote") return <NoReplayNote clip={moment.clip} />;

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
          poster={frameUrl(sessionId, moment.frameId)}
          playsInline
          className="block size-full bg-sunken object-contain"
          aria-label={`Session clip ${formatClip(moment.clip)}`}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={replay.onVideoReady}
          onError={replay.onVideoError}
          onTimeUpdate={(e) => {
            const ms = e.currentTarget.currentTime * 1000;
            setNowMs(ms);
            if (ms >= endMs) e.currentTarget.pause();
          }}
        />
        {replay.mode === "probing" ? (
          <p className="absolute inset-x-0 bottom-0 bg-sunken/90 px-3 py-1.5 text-xs text-ink-muted">
            No recording for this session; looking for its stored frames.
          </p>
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
