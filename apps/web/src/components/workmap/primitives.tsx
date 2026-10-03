"use client";

import type { Guardrail, Quote } from "@shadow/schema";
import type { ReactNode } from "react";
import { formatMs, GUARDRAIL_TYPE_LABEL, SOURCE_LABEL, SPEAKER_LABEL } from "./format";

const TYPE_CLASSES: Record<Guardrail["type"], string> = {
  limit: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  exception: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  stop_and_ask: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  never: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function GuardrailTypeBadge({ type }: { type: Guardrail["type"] }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${TYPE_CLASSES[type]}`}
    >
      {GUARDRAIL_TYPE_LABEL[type]}
    </span>
  );
}

export function JudgmentBadge() {
  return (
    <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      Judgment call
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const tones = {
    neutral: "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300",
    good: "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200",
    warn: "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** The expert's own words, verbatim, with who said it, when, and in what context. */
export function QuoteBlock({ quote, compact = false }: { quote: Quote; compact?: boolean }) {
  return (
    <figure className={compact ? "" : "mt-2"}>
      <blockquote
        className={`border-l-2 border-neutral-300 pl-3 italic text-neutral-800 dark:border-neutral-600 dark:text-neutral-200 ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        “{quote.text}”
      </blockquote>
      <figcaption className="mt-1 pl-3 text-xs text-neutral-500">
        {SPEAKER_LABEL[quote.speaker]} at{" "}
        <time dateTime={`PT${Math.floor(quote.tMs / 1000)}S`}>{formatMs(quote.tMs)}</time>,{" "}
        {SOURCE_LABEL[quote.source]} · segment {quote.segmentId}
      </figcaption>
    </figure>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</h3>
  );
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
  const tones = {
    default:
      "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800",
    danger:
      "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
    primary:
      "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={`rounded border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${
        pressed ? "ring-2 ring-neutral-400 dark:ring-neutral-500" : ""
      }`}
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
    <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
      <span className="text-neutral-700 dark:text-neutral-300">{message}</span>
      <Button tone="danger" onClick={onConfirm} disabled={busy}>
        {busy ? "Working…" : confirmLabel}
      </Button>
      <Button onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
