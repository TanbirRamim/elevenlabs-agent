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
    <figure className="overflow-hidden rounded-panel border border-rule bg-sunken">
      {/* biome-ignore lint/a11y/useMediaCaption: the session recording has no caption track; the verbatim quote shown beside the player is its transcript */}
      <video
        key={src}
        controls
        preload="metadata"
        src={src}
        className="block aspect-video w-full bg-black"
        aria-label={`Session clip ${formatClip(moment.clip)}`}
      />
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule px-3 py-2 text-xs text-ink-muted">
        <span>Clip of the session recording</span>
        <span className="font-mono text-ink-faint tabular-nums">{formatClip(moment.clip)}</span>
      </figcaption>
    </figure>
  );
}
