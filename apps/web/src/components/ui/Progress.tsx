import type { ReactNode } from "react";
import { cx } from "./cx";

export function clampRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export type ProgressProps = {
  /** Omit for an indeterminate bar (work with no known end). */
  value?: number;
  max?: number;
  /** Accessible name, e.g. "Work Map draft". */
  label: string;
  /** Visible value text, e.g. "3 of 4". Defaults to a percentage. */
  valueText?: string;
  tone?: "ink" | "ok" | "ask";
  className?: string;
};

const FILL = { ink: "bg-ink", ok: "bg-ok-fill", ask: "bg-ask" } as const;

/** Task progress (role="progressbar"). 4px track, no stripes, no glow. */
export function Progress({
  value,
  max = 100,
  label,
  valueText,
  tone = "ink",
  className,
}: ProgressProps) {
  const determinate = typeof value === "number";
  const ratio = determinate ? clampRatio(value, max) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
      aria-valuetext={determinate ? (valueText ?? `${Math.round(ratio * 100)}%`) : "In progress"}
      className={cx("h-1 w-full overflow-hidden rounded-pill bg-rule", className)}
    >
      <div
        className={cx(
          "h-full rounded-pill transition-[width] duration-200 ease-out",
          FILL[tone],
          !determinate && "w-1/3 animate-shimmer motion-reduce:animate-none",
        )}
        style={determinate ? { width: `${ratio * 100}%` } : undefined}
      />
    </div>
  );
}

export type MeterProps = {
  value: number;
  max?: number;
  label: string;
  valueText?: string;
  /** Number of segments (e.g. 12 for a mic level meter). Omit for a continuous bar. */
  segments?: number;
  tone?: "ink" | "ok" | "ask" | "rec";
  className?: string;
  /** Visible caption next to the meter. */
  caption?: ReactNode;
};

const SEG = { ink: "bg-ink", ok: "bg-ok-fill", ask: "bg-ask", rec: "bg-rec" } as const;

/** A measurement in a known range (role="meter"): coverage, mic level, confidence. */
export function Meter({
  value,
  max = 1,
  label,
  valueText,
  segments,
  tone = "ink",
  className,
  caption,
}: MeterProps) {
  const ratio = clampRatio(value, max);
  const lit = segments ? Math.round(ratio * segments) : 0;
  return (
    <div className={cx("flex items-center gap-2", className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: native <meter> cannot render segments; ARIA meter carries the value */}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText ?? `${Math.round(ratio * 100)}%`}
        className={cx(
          "flex h-1.5 min-w-0 flex-1 items-center",
          segments ? "gap-0.5" : "overflow-hidden rounded-pill bg-rule",
        )}
      >
        {segments ? (
          Array.from({ length: segments }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
              key={i}
              className={cx("h-full flex-1 rounded-[1px]", i < lit ? SEG[tone] : "bg-rule")}
            />
          ))
        ) : (
          <span
            className={cx("h-full rounded-pill transition-[width] duration-100", SEG[tone])}
            style={{ width: `${ratio * 100}%` }}
          />
        )}
      </div>
      {caption ? <span className="figures shrink-0 text-xs text-ink-muted">{caption}</span> : null}
    </div>
  );
}
