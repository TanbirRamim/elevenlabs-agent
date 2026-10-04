"use client";

import dynamic from "next/dynamic";
import { cx } from "../ui/cx";
import { OrbFallback } from "../voice/OrbFallback";
import { ORB_STATE_LABEL, type OrbState } from "../voice/orbState";
import type { Clock, Transcript } from "./frame";
import type { Caption, Speaker } from "./script";

const VoiceOrb = dynamic(() => import("../voice/VoiceOrb"), {
  ssr: false,
  loading: () => <OrbFallback state="listening" />,
});

const SPEAKER: Record<Speaker, string | null> = {
  narrator: null,
  maya: "Maya, senior lead",
  shadow: "Shadow",
  jonas: "Jonas, new hire",
};

const OFF_RECORD_TEXT = "Off the record. Nothing from this span is transcribed or stored.";

/**
 * The orb and a two-line transcript: who is speaking, typed out as they speak. No audio is
 * needed. The expert's words are set in the serif italic (docs/DESIGN.md). Screen readers get
 * each line once, whole, through a polite live region.
 */
export function CaptionBar({
  orb,
  transcript,
  clock,
}: {
  orb: OrbState;
  transcript: Transcript;
  clock: Clock | null;
}) {
  const { previous, current, revealed } = transcript;
  const active = orb === "listening" || orb === "speaking";
  return (
    <section
      aria-label="Captions"
      className="grid grid-cols-[4.5rem_1fr] items-start gap-4 sm:grid-cols-[6rem_1fr] sm:gap-6"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="relative size-[4.5rem] overflow-hidden sm:size-24">
          <VoiceOrb state={orb} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <span
              aria-hidden="true"
              className={cx(
                "size-1.5 rounded-full",
                active ? "bg-ask" : orb === "off-record" ? "bg-ink-faint" : "bg-ink-muted",
              )}
            />
            <span className={active ? "text-ask-text" : undefined}>{ORB_STATE_LABEL[orb]}</span>
          </p>
          {clock ? (
            <p className="flex items-baseline gap-2 font-mono text-xs text-ink-faint">
              <span>{clock.label}</span>
              <span className="text-[0.8125rem] text-ink tabular-nums">{mmss(clock.ms)}</span>
              {clock.speed ? (
                <span className="tabular-nums">time-lapse {Math.round(clock.speed)}×</span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="mt-2 flex min-h-[6.75rem] flex-col justify-end sm:min-h-[7rem]"
        >
          {previous ? <Line caption={previous} revealed={previous.text.length} faded /> : null}
          {current ? <Line caption={current} revealed={revealed} /> : null}
        </div>
        <p aria-live="polite" className="sr-only">
          {current ? spoken(current) : ""}
        </p>
      </div>
    </section>
  );
}

function Line({
  caption,
  revealed,
  faded = false,
}: {
  caption: Caption;
  revealed: number;
  faded?: boolean;
}) {
  const name = SPEAKER[caption.speaker];
  const expert = caption.speaker === "maya" && !caption.offRecord;
  const text = caption.offRecord ? OFF_RECORD_TEXT : caption.text.slice(0, revealed);
  return (
    <div className={cx("min-w-0", faded ? "mb-2 line-clamp-1 opacity-60" : "")}>
      {name && !faded ? (
        <p
          className={cx(
            "mb-0.5 text-sm",
            caption.speaker === "shadow" ? "text-ask-text" : "text-ink-muted",
          )}
        >
          {name}
        </p>
      ) : null}
      <p
        className={cx(
          "text-pretty",
          faded
            ? "truncate text-[0.9375rem] text-ink-muted"
            : expert
              ? "text-base leading-snug text-ink"
              : caption.speaker === "narrator"
                ? "text-base leading-snug text-ink"
                : caption.offRecord
                  ? "text-[1.125rem] leading-snug text-ink-muted sm:text-[1.25rem]"
                  : "text-[1.125rem] leading-snug text-ink sm:text-[1.375rem]",
        )}
      >
        {faded && name ? <span className="text-ink-faint">{name.split(",")[0]}: </span> : null}
        {expert ? `“${text}${revealed >= caption.text.length ? "”" : ""}` : text}
      </p>
    </div>
  );
}

function spoken(c: Caption): string {
  if (c.offRecord) return OFF_RECORD_TEXT;
  const name = SPEAKER[c.speaker];
  return name ? `${name.split(",")[0]}: ${c.text}` : c.text;
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
