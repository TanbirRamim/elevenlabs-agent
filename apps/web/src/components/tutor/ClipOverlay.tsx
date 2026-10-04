"use client";

import type { ScreenMoment } from "@shadow/schema";
import { Dialog } from "@/components/ui";
import { FrameSlideshow, NoReplayNote, useScreenReplay } from "@/components/workmap/ClipPlayer";
import { formatClip, formatMs } from "@/components/workmap/format";
import { recordingUrl } from "@/lib/api";
import type { MomentRef } from "./logic";

export interface ClipOverlayProps {
  /** The frame to show; null keeps the dialog closed. */
  frameId: string | null;
  /** Null when the Work Map has no moment for this frame. */
  moment: MomentRef | null;
  expertName: string;
  /**
   * The expert's capture session, already resolved (`?expertSession=` then the map's
   * `sourceSessionId`, see workmap/load.ts `resolveExpertSession`). Null: nothing to replay.
   */
  expertSessionId: string | null;
  /** Every moment of the map; their frames near this one make up the slideshow fallback. */
  nearby?: readonly ScreenMoment[];
  onClose: () => void;
}

/**
 * Plays the expert's clip around a step, in a native modal dialog (focus trap, Escape and focus
 * return come from the browser). Its own player instead of workmap/ClipPlayer because the
 * tutor's replay must start on its own (autoPlay); the recording has no audio track.
 * Without a recording it plays the stored, redacted frames around the moment as a slideshow;
 * without those it shows the expert's words with an honest note, never a broken player.
 * Stay mounted and drive it with `frameId` so the dialog can close and hand focus back.
 */
export function ClipOverlay({
  frameId,
  moment,
  expertName,
  expertSessionId,
  nearby = EMPTY,
  onClose,
}: ClipOverlayProps) {
  const open = frameId !== null;
  const clip = moment?.moment.clip;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title={`${expertName}'s moment`}
      description={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{moment?.title ?? `Frame ${frameId ?? ""}`}</span>
          {clip ? (
            <span className="figures font-mono text-xs text-ink-faint">{formatClip(clip)}</span>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {open && moment ? (
          <ScreenReplay
            // A new moment or session starts over: recording first, then frames.
            key={`${expertSessionId ?? ""}#${moment.moment.frameId}`}
            sessionId={expertSessionId}
            moment={moment.moment}
            nearby={nearby}
          />
        ) : null}
        {moment ? (
          <figure>
            <blockquote className="border-l-2 border-rule-strong pl-3.5 text-lg leading-relaxed text-pretty text-ink">
              “{moment.quote}”
            </blockquote>
            <figcaption className="mt-2 flex flex-wrap gap-x-3 pl-3.5 text-xs text-ink-muted">
              <span className="font-medium text-ink">{expertName}</span>
              <span className="figures font-mono">on screen at {formatMs(moment.moment.tMs)}</span>
              <span className="font-mono">frame {moment.moment.frameId}</span>
            </figcaption>
          </figure>
        ) : (
          <p className="text-ui text-ink-muted">
            The Work Map has no moment for frame{" "}
            <span className="font-mono text-xs text-ink">{frameId}</span>.
          </p>
        )}
      </div>
    </Dialog>
  );
}

const EMPTY: readonly ScreenMoment[] = [];

function ScreenReplay({
  sessionId,
  moment,
  nearby,
}: {
  sessionId: string | null;
  moment: ScreenMoment;
  nearby: readonly ScreenMoment[];
}) {
  const replay = useScreenReplay(sessionId, moment, nearby);
  if (replay.mode === "quote" || !sessionId) return <NoReplayNote />;
  if (replay.mode === "slideshow") {
    return (
      <FrameSlideshow sessionId={sessionId} slides={replay.slides} clip={moment.clip} autoPlay />
    );
  }
  const src = `${recordingUrl(sessionId)}#t=${moment.clip[0] / 1000},${moment.clip[1] / 1000}`;
  return (
    <div className="relative">
      <video
        src={src}
        autoPlay
        muted
        playsInline
        controls
        aria-label={`Session clip ${formatClip(moment.clip)}`}
        onLoadedMetadata={replay.onVideoReady}
        onError={replay.onVideoError}
        className="block aspect-video w-full rounded-panel border border-rule bg-black"
      />
      {replay.mode === "probing" ? (
        <p className="absolute inset-x-0 bottom-0 rounded-b-panel bg-sunken/90 px-3 py-1.5 text-xs text-ink-muted">
          No recording for this session; looking for its stored frames.
        </p>
      ) : null}
    </div>
  );
}
