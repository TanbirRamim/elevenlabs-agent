"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { cx } from "@/components/ui/cx";
import { OrbFallback } from "./OrbFallback";
import { ORB_STATE_LABEL, ORB_STATES, type OrbState } from "./orbState";

const VoiceOrb = dynamic(() => import("./VoiceOrb"), {
  ssr: false,
  loading: () => <OrbFallback state="listening" />,
});

const SHORT: Record<OrbState, string> = {
  idle: "Quiet",
  listening: "Listening",
  speaking: "Asking",
  "off-record": "Off the record",
};

const CAPTION: Record<OrbState, string> = {
  idle: "Nothing on screen needs a question yet.",
  listening: "The expert is working. Shadow follows the screen and the voice.",
  speaking: "A natural pause. Shadow asks one short question about what just happened.",
  "off-record": "Nothing is sent or stored until the expert says “back on the record.”",
};

/** The landing-page orb with a control to step through the four states it can show. */
export function OrbStateDemo({ className }: { className?: string }) {
  const [state, setState] = useState<OrbState>("listening");
  const captionId = useId();

  return (
    <figure className={cx("flex flex-col", className)}>
      <div className="relative mx-auto aspect-square w-full max-w-[26rem]">
        <VoiceOrb state={state} />
      </div>
      <figcaption className="mt-6 flex flex-col gap-4">
        <fieldset>
          <legend className="sr-only">Show the orb in a state</legend>
          <div className="flex flex-wrap gap-1.5">
            {ORB_STATES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={state === s}
                aria-describedby={state === s ? captionId : undefined}
                onClick={() => setState(s)}
                className={cx(
                  "inline-flex min-h-10 items-center gap-2 rounded-pill border px-3.5 text-sm transition-colors duration-150",
                  state === s
                    ? "border-ink bg-ink text-canvas"
                    : "border-rule text-ink-muted hover:border-rule-strong hover:text-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "size-1.5 rounded-full",
                    s === "listening" || s === "speaking"
                      ? "bg-signal"
                      : s === "off-record"
                        ? "bg-ink-faint"
                        : "bg-current opacity-60",
                  )}
                />
                {SHORT[s]}
              </button>
            ))}
          </div>
        </fieldset>
        <p
          id={captionId}
          aria-live="polite"
          className="text-[0.9375rem] leading-relaxed text-ink-muted"
        >
          <span className="font-mono text-[0.8125rem] text-ink">{ORB_STATE_LABEL[state]}.</span>{" "}
          {CAPTION[state]}
        </p>
      </figcaption>
    </figure>
  );
}
