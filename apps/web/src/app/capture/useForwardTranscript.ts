"use client";

import { useLayoutEffect, useRef } from "react";
import type { VoiceLine } from "@/lib/voice";

/**
 * Hands each new transcript line to `forward` exactly once, in order.
 *
 * A layout effect on purpose: React runs every layout effect before any passive effect, so a
 * line is forwarded (and marked as sent) before children such as the debrief read it in their
 * own effects. With a passive effect the parent's ran after the child's, the debrief saw the
 * expert's spoken "yes" as not-yet-sent, and nothing re-checked it until Shadow spoke again.
 */
export function useForwardTranscript(
  lines: readonly VoiceLine[],
  forward: (line: VoiceLine) => void,
): void {
  const handled = useRef(0);
  const latest = useRef(forward);
  latest.current = forward;
  useLayoutEffect(() => {
    for (let i = handled.current; i < lines.length; i++) {
      const line = lines[i];
      if (line) latest.current(line);
    }
    handled.current = lines.length;
  }, [lines]);
}
