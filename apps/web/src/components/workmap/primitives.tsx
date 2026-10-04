"use client";

import type { Guardrail, Quote } from "@shadow/schema";
import { Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type BadgeTone, cx, Button as UiButton } from "../ui";
import { formatMs, GUARDRAIL_TYPE_LABEL, SOURCE_LABEL, SPEAKER_LABEL } from "./format";

/**
 * Guardrail tone by meaning (docs/DESIGN.md §4): a "stop and ask" rule holds the action
 * (`guard`), a "never" rule is a hard risk (`danger`), limits and exceptions stay neutral.
 * The label always carries the type; colour only reinforces it.
 */
export const GUARDRAIL_TONE: Record<Guardrail["type"], BadgeTone> = {
  limit: "neutral",
  exception: "muted",
  stop_and_ask: "guard",
  never: "danger",
};

/** Colour of the thin rule on a guardrail row's leading edge, by type. */
export const GUARDRAIL_EDGE: Record<Guardrail["type"], string> = {
  limit: "bg-rule-strong",
  exception: "bg-rule",
  stop_and_ask: "bg-guard",
  never: "bg-danger-fill",
};

export function GuardrailTypeBadge({ type }: { type: Guardrail["type"] }) {
  return (
    <Badge tone={GUARDRAIL_TONE[type]} dot={type === "stop_and_ask" || type === "never"}>
      {GUARDRAIL_TYPE_LABEL[type]}
    </Badge>
  );
}

/** Marks a step where the expert used judgment rather than a fixed rule. */
export function JudgmentBadge() {
  return (
    <Badge tone="guard" icon={<Scale aria-hidden="true" />}>
      Judgment call
    </Badge>
  );
}

/**
 * The expert's own words, verbatim: regular-weight sans, a 2px left rule and curly quotes,
 * with who said it, when (mono) and in what context underneath.
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
          "border-l-2 border-rule-strong pl-3 text-pretty text-ink",
          resolved === "lg" && "text-base leading-relaxed",
          resolved === "md" && "text-sm leading-relaxed",
          resolved === "sm" && "text-ui",
        )}
      >
        “{quote.text}”
      </blockquote>
      <figcaption
        className={cx(
          "flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3.5 text-xs text-ink-faint",
          resolved === "lg" ? "mt-2.5" : "mt-1.5",
        )}
      >
        <span className="font-medium text-ink-muted">
          {speakerName ?? SPEAKER_LABEL[quote.speaker]}
        </span>
        <span aria-hidden="true">·</span>
        <time className="figures font-mono" dateTime={`PT${Math.floor(quote.tMs / 1000)}S`}>
          {formatMs(quote.tMs)}
        </time>
        <span aria-hidden="true">·</span>
        <span>{SOURCE_LABEL[quote.source]}</span>
      </figcaption>
    </figure>
  );
}

/** A small label above a block inside a panel (12px, muted). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-medium text-ink-muted">{children}</h3>;
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
    <div className="flex flex-wrap items-center gap-3 rounded-panel border border-rule bg-sunken px-3 py-2.5 text-ui">
      <span className="min-w-0 flex-1 basis-60 text-ink">{message}</span>
      <div className="flex gap-2">
        <UiButton size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </UiButton>
        <UiButton size="sm" variant="danger" onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </UiButton>
      </div>
    </div>
  );
}
