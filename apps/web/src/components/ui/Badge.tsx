import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * `signal` is reserved for "Shadow is listening or asking" and guardrail moments.
 * Do not use it for emphasis. See docs/DESIGN.md.
 */
export type BadgeTone = "neutral" | "signal" | "ok" | "stop" | "muted";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-rule-strong text-ink",
  muted: "border-rule text-ink-muted",
  signal: "border-transparent bg-signal-wash text-signal-text",
  ok: "border-transparent bg-ok-wash text-ok",
  stop: "border-transparent bg-stop-wash text-stop",
};

const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-ink-muted",
  muted: "bg-ink-faint",
  signal: "bg-signal",
  ok: "bg-ok",
  stop: "bg-stop",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  /** A leading status dot. Decorative: the text must carry the meaning. */
  dot?: boolean;
};

export function Badge({ tone = "neutral", dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[0.8125rem] leading-5 font-medium",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", DOTS[tone])} />
      ) : null}
      {children}
    </span>
  );
}

/** Alias for places that read better as a chip (filters, tags). Same component. */
export const Chip = Badge;
