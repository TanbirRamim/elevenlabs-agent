"use client";

import { Film } from "lucide-react";
import { Dialog } from "@/components/ui";
import { formatClip, formatMs } from "@/components/workmap/format";
import { recordingUrl } from "@/lib/api";
import type { MomentRef } from "./logic";

export interface ClipOverlayProps {
  /** The frame to show; null keeps the dialog closed. */
  frameId: string | null;
  /** Null when the Work Map has no moment for this frame. */
  moment: MomentRef | null;
  expertName: string;
  /** The expert's capture session; without it there is no recording to play. */
  expertSessionId: string | null;
  onClose: () => void;
}

/**
 * Plays the expert's clip around a step, in a native modal dialog (focus trap, Escape and focus
 * return come from the browser). Its own player instead of workmap/ClipPlayer because the
 * tutor's replay must start on its own (autoPlay); the recording has no audio track.
 * Stay mounted and drive it with `frameId` so the dialog can close and hand focus back.
 */
export function ClipOverlay({
  frameId,
  moment,
  expertName,
  expertSessionId,
  onClose,
}: ClipOverlayProps) {
  const clip = moment?.moment.clip;
  const src =
    clip && expertSessionId
      ? `${recordingUrl(expertSessionId)}#t=${clip[0] / 1000},${clip[1] / 1000}`
      : null;

  return (
    <Dialog
      open={frameId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
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
        {src ? (
          <video
            key={src}
            src={src}
            autoPlay
            muted
            playsInline
            controls
            className="block aspect-video w-full rounded-panel border border-rule bg-black"
          />
        ) : moment ? (
          <div className="flex w-full flex-col items-start gap-1 rounded-panel border border-dashed border-rule-strong bg-sunken p-4">
            <Film aria-hidden="true" className="size-5 stroke-[1.5] text-ink-muted" />
            <p className="text-ui font-medium text-ink">Recording not linked on this page</p>
            <p className="text-ui text-ink-muted">
              Open Teach with{" "}
              <code className="font-mono text-xs text-ink">?expertSession=&lt;capture id&gt;</code>{" "}
              to play the screen recording. {expertName}'s words are below.
            </p>
          </div>
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
