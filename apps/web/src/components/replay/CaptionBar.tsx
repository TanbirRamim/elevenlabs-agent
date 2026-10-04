"use client";

import dynamic from "next/dynamic";
import { Avatar } from "../ui/Avatar";
import { StatusPill } from "../ui/Badge";
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
  shadow: "Singoda AI",
  jonas: "Jonas, new hire",
};

const OFF_RECORD_TEXT = "Off the record. Nothing from this span is transcribed or stored.";

/**
 * The orb and a two-line transcript: who is speaking, typed out as they speak. No audio is
 * needed. Expert quotes are regular sans in curly quotes (docs/DESIGN.md). Screen readers get
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
      className="grid grid-cols-[3.5rem_1fr] items-start gap-3 sm:grid-cols-[4.5rem_1fr] sm:gap-4"
    >
      <div className="relative size-14 overflow-hidden rounded-panel border border-rule bg-sunken sm:size-[4.5rem]">
        <VoiceOrb state={orb} />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <StatusPill tone={active ? "ask" : "muted"} live={active}>
            {ORB_STATE_LABEL[orb]}
          </StatusPill>
          {clock ? (
            <p className="figures flex items-baseline gap-2 font-mono text-2xs text-ink-faint">
              <span>{clock.label}</span>
              <span className="text-xs text-ink">{mmss(clock.ms)}</span>
              {clock.speed ? <span>time-lapse {Math.round(clock.speed)}×</span> : null}
            </p>
          ) : null}
        </div>

        <div aria-hidden="true" className="mt-2 flex min-h-[6.5rem] flex-col justify-end">
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
  const isShadow = caption.speaker === "shadow";
  const text = caption.offRecord ? OFF_RECORD_TEXT : caption.text.slice(0, revealed);
  if (faded) {
    return (
      <p className="mb-2 truncate text-ui text-ink-faint">
        {name ? <span className="font-medium">{name.split(",")[0]}: </span> : null}
        {text}
      </p>
    );
  }
  return (
    <div className="min-w-0">
      {name ? (
        <p className="mb-1 flex items-center gap-2 text-xs font-medium">
          {isShadow ? (
            <Avatar name="Singoda AI" size="xs" shadow />
          ) : (
            <Avatar name={name.split(",")[0] ?? name} size="xs" />
          )}
          <span className={isShadow ? "text-ask-text" : "text-ink-muted"}>{name}</span>
        </p>
      ) : null}
      <p
        className={cx(
          "text-base leading-6 text-pretty",
          caption.offRecord ? "text-ink-muted" : "text-ink",
          expert && "border-l-2 border-rule-strong pl-3",
        )}
      >
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
