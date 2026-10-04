"use client";

import type { Guardrail, Quote } from "@shadow/schema";
import type { ReactNode } from "react";
import { Badge, type BadgeTone, buttonClasses, cx } from "../ui";
import { formatMs, GUARDRAIL_TYPE_LABEL, SOURCE_LABEL, SPEAKER_LABEL } from "./format";

/**
 * Guardrails are the one place the signal may appear on this page (docs/DESIGN.md). Within that,
 * severity is carried by tone and always by the label: a "never" rule reads as a stop.
 */
const TYPE_TONE: Record<Guardrail["type"], BadgeTone> = {
  limit: "neutral",
  exception: "muted",
  stop_and_ask: "signal",
  never: "stop",
};

/** Colour of the thin rule on a guardrail card's leading edge, by type. */
export const GUARDRAIL_EDGE: Record<Guardrail["type"], string> = {
  limit: "bg-rule-strong",
  exception: "bg-rule",
  stop_and_ask: "bg-signal",
  never: "bg-stop",
};

export function GuardrailTypeBadge({ type }: { type: Guardrail["type"] }) {
  return (
    <Badge tone={TYPE_TONE[type]} dot={type === "stop_and_ask" || type === "never"}>
      {GUARDRAIL_TYPE_LABEL[type]}
    </Badge>
  );
}

/** Marks a step where the expert used judgment rather than a fixed rule. */
export function JudgmentBadge() {
  return (
    <Badge tone="signal" dot>
      Judgment call
    </Badge>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const map = { neutral: "muted", good: "ok", warn: "neutral" } as const;
  return (
    <Badge tone={map[tone]} dot={tone !== "neutral"}>
      {children}
    </Badge>
  );
}

/**
 * The expert's own words, verbatim, in the display serif italic, with who said it, when and in
 * what context set in mono underneath. `size` scales the quote; the metadata stays the same.
 */
export function QuoteBlock({
  quote,
  compact = false,
  size,
  speakerName,
}: {
  quote: Quote;
  compact?: boolean;
  size?: "sm" | "md" | "lg";
  /** Shown instead of the generic speaker label, e.g. the expert's name. */
  speakerName?: string;
}) {
  const resolved = size ?? (compact ? "sm" : "md");
  return (
    <figure className="min-w-0">
      <blockquote
        className={cx(
          "font-display font-normal italic text-pretty text-ink",
          resolved === "lg" &&
            "text-[1.625rem] leading-[1.25] tracking-[-0.01em] sm:text-[2rem] sm:leading-[1.2]",
          resolved === "md" && "text-[1.375rem] leading-snug",
          resolved === "sm" && "text-[1.125rem] leading-snug",
        )}
      >
        “{quote.text}”
      </blockquote>
      <figcaption
        className={cx(
          "flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-xs text-ink-faint",
          resolved === "lg" ? "mt-4" : "mt-2",
        )}
      >
        <span className="text-ink-muted">{speakerName ?? SPEAKER_LABEL[quote.speaker]}</span>
        <time className="tabular-nums" dateTime={`PT${Math.floor(quote.tMs / 1000)}S`}>
          {formatMs(quote.tMs)}
        </time>
        <span>{SOURCE_LABEL[quote.source]}</span>
        <span>segment {quote.segmentId}</span>
      </figcaption>
    </figure>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-medium text-ink-muted">{children}</h3>;
}

type ButtonProps = {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "primary";
  title?: string;
  pressed?: boolean;
};

export function Button({
  children,
  onClick,
  disabled,
  tone = "default",
  title,
  pressed,
}: ButtonProps) {
  const className =
    tone === "primary"
      ? buttonClasses({ size: "sm" })
      : tone === "danger"
        ? buttonClasses({
            variant: "secondary",
            size: "sm",
            className: "border-stop/50 text-stop hover:border-stop hover:bg-stop-wash",
          })
        : pressed
          ? buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "border-ink bg-ink text-canvas hover:bg-ink/88 hover:text-canvas",
            })
          : buttonClasses({ variant: "secondary", size: "sm", className: "text-ink-muted" });
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={className}
    >
      {children}
    </button>
  );
}

/** Inline confirmation that replaces the triggering control; never a browser dialog. */
export function InlineConfirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-panel border border-rule-strong bg-sunken px-4 py-3 text-[0.9375rem]">
      <span className="min-w-0 flex-1 basis-60 text-ink">{message}</span>
      <div className="flex gap-2">
        <Button tone="danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
