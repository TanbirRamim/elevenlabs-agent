"use client";

import { useEffect, useState } from "react";
import { onWakeState, type WakeState, wakeState } from "@/lib/wake";

/** Shown while the API host wakes from sleep or restarts after a deploy, instead of an error. */
export function WakeBanner() {
  const [state, setState] = useState<WakeState>("awake");
  useEffect(() => {
    setState(wakeState());
    return onWakeState(setState);
  }, []);
  if (state === "awake") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-3 z-[60] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full border border-rule bg-surface px-4 py-2 text-sm text-ink shadow-raised"
    >
      {state === "waking" ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-ask" />
          Waking up Singoda AI&apos;s server. This takes up to a minute on the free host.
        </span>
      ) : (
        <span>Singoda AI&apos;s server did not answer. Reload the page in a moment.</span>
      )}
    </div>
  );
}
