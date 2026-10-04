"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { cx } from "./cx";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  size?: "sm" | "md";
  className?: string;
};

/** Moves to the next enabled index in a direction, wrapping around. Pure, exported for tests. */
export function nextEnabledIndex(disabled: readonly boolean[], from: number, step: 1 | -1): number {
  const n = disabled.length;
  for (let i = 1; i <= n; i += 1) {
    const idx = (((from + step * i) % n) + n) % n;
    if (!disabled[idx]) return idx;
  }
  return from;
}

/**
 * A small set of mutually exclusive views or filters (radiogroup semantics): one tab stop,
 * arrow keys move and select, Home/End jump.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const disabled = options.map((o) => Boolean(o.disabled));
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const select = (idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    refs.current[idx]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      select(nextEnabledIndex(disabled, idx, 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      select(nextEnabledIndex(disabled, idx, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      select(nextEnabledIndex(disabled, -1, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      select(nextEnabledIndex(disabled, options.length, -1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "inline-flex items-center gap-0.5 rounded-control bg-sunken p-0.5 ring-1 ring-rule ring-inset",
        className,
      )}
    >
      {options.map((o, idx) => {
        const checked = idx === current;
        return (
          // biome-ignore lint/a11y/useSemanticElements: button-based radios keep the segmented look; roving tabindex and arrows follow the ARIA radio pattern
          <button
            key={o.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.ariaLabel}
            disabled={o.disabled}
            tabIndex={checked ? 0 : -1}
            onClick={() => select(idx)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cx(
              "inline-flex items-center justify-center gap-1.5 rounded-[4px] px-2.5 font-medium whitespace-nowrap transition-colors duration-100",
              "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:stroke-[1.75]",
              size === "sm" ? "h-6 text-xs" : "h-7 text-ui",
              checked
                ? "bg-surface text-ink shadow-raised ring-1 ring-rule"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
