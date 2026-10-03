"use client";

import type { ScreenMoment } from "@shadow/schema";
import { formatClip } from "./format";
import { recordingUrl } from "./load";

/**
 * Replays the session recording seeked to `moment.clip` via a media fragment (#t=start,end).
 * Rendered only when a session id is known; without one there is no recording to play.
 */
export function ClipPlayer({ moment, sessionId }: { moment: ScreenMoment; sessionId: string }) {
  const [startMs, endMs] = moment.clip;
  const src = `${recordingUrl(sessionId)}#t=${startMs / 1000},${endMs / 1000}`;
  return (
    <div>
      {/* biome-ignore lint/a11y/useMediaCaption: the session recording has no caption track; the verbatim quote shown beside the player is its transcript */}
      <video
        key={src}
        controls
        preload="metadata"
        src={src}
        className="aspect-video w-full rounded border border-neutral-200 bg-black dark:border-neutral-800"
        aria-label={`Session clip ${formatClip(moment.clip)}`}
      />
      <p className="mt-1 text-xs text-neutral-500">
        Clip {formatClip(moment.clip)} of the session recording
      </p>
    </div>
  );
}
