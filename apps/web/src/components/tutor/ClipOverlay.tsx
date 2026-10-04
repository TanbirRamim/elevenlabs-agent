"use client";

import { formatClip } from "@/components/workmap/format";
import { recordingUrl } from "@/lib/api";
import type { MomentRef } from "./logic";

export interface ClipOverlayProps {
  frameId: string;
  /** Null when the Work Map has no moment for this frame. */
  moment: MomentRef | null;
  expertName: string;
  /** The expert's capture session; without it there is no recording to play. */
  expertSessionId: string | null;
  onClose: () => void;
}

/**
 * Plays the expert's clip around a step. Its own player instead of workmap/ClipPlayer because
 * the tutor's replay must start on its own (autoPlay); the recording has no audio track.
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${expertName}'s moment`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-3xl rounded-lg bg-white p-4 text-neutral-900 shadow-xl dark:bg-neutral-900 dark:text-neutral-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {expertName}'s moment{clip ? ` · ${formatClip(clip)}` : ""}
            </p>
            <h2 className="text-lg font-semibold">{moment?.title ?? `Frame ${frameId}`}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
          >
            Close
          </button>
        </div>
        {src && (
          <video
            key={src}
            src={src}
            autoPlay
            muted
            playsInline
            controls
            className="mt-3 aspect-video w-full rounded border border-neutral-200 bg-black dark:border-neutral-800"
          />
        )}
        {moment ? (
          <blockquote className="mt-3 border-l-4 border-neutral-400 pl-3 italic">
            “{moment.quote}” <span className="not-italic text-neutral-500">— {expertName}</span>
          </blockquote>
        ) : (
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            The Work Map has no moment for frame {frameId}.
          </p>
        )}
        {moment && !expertSessionId && (
          <p className="mt-2 text-xs text-neutral-500">
            The expert's recording isn't linked to this page (add ?expertSession=&lt;capture session
            id&gt;), so only the quote is shown.
          </p>
        )}
      </div>
    </div>
  );
}
