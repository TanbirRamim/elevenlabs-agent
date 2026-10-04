import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Tones are meanings, not decoration (docs/DESIGN.md, "Colour by meaning"):
 * - `ask`: Singoda AI is listening or asking (brand colour)
 * - `rec`: recording is live
 * - `guard`: a guardrail held or blocked an action
 * - `ok`: success, verified, confirmed
 * - `danger`: an error or a destructive action
 * - `neutral` / `muted`: everything else
 */
export type BadgeTone = "neutral" | "muted" | "ask" | "rec" | "guard" | "ok" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-rule-strong bg-surface text-ink",
  muted: "border-rule bg-sunken text-ink-muted",
  ask: "border-transparent bg-ask-wash text-ask-text",
  rec: "border-transparent bg-rec-wash text-rec-text",
  guard: "border-transparent bg-guard-wash text-guard-text",
  ok: "border-transparent bg-ok-wash text-ok",
  danger: "border-transparent bg-danger-wash text-danger",
};

export const DOT_TONES: Record<BadgeTone, string> = {
  neutral: "bg-ink-muted",
  muted: "bg-ink-faint",
  ask: "bg-ask",
  rec: "bg-rec",
  guard: "bg-guard",
  ok: "bg-ok-fill",
  danger: "bg-danger-fill",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  /** A leading status dot. Decorative: the text must carry the meaning. */
  dot?: boolean;
  /** Leading icon (lucide, 12px). */
  icon?: ReactNode;
};

/** A compact label: 20px tall, 12px text. For counts, kinds and states. */
export function Badge({
  tone = "neutral",
  dot = false,
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-control border px-1.5 text-xs leading-none font-medium whitespace-nowrap",
        "[&_svg]:size-3 [&_svg]:stroke-2",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cx("size-1.5 shrink-0 rounded-full", DOT_TONES[tone])}
        />
      ) : null}
      {icon}
      {children}
    </span>
  );
}

/** Alias for places that read better as a chip (filters, tags). Same component. */
export const Chip = Badge;

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  /** Pulse the dot. Only for a state that is live right now (recording, listening). */
  live?: boolean;
};

/** A rounded status: dot + words. The words carry the state; the dot only reinforces it. */
export function StatusPill({
  tone = "neutral",
  live = false,
  className,
  children,
  ...rest
}: StatusPillProps) {
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cx(
          "size-1.5 shrink-0 rounded-full",
          DOT_TONES[tone],
          live && "animate-rec-pulse",
        )}
      />
      {children}
    </span>
  );
}
