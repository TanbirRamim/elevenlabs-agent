"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { cx } from "./cx";
import { nextEnabledIndex } from "./SegmentedControl";

export type TabItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  /** A count shown after the label in tabular figures. */
  count?: number;
  disabled?: boolean;
  content: ReactNode;
};

export type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  /** Controlled value. */
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
};

/**
 * WAI-ARIA tabs with automatic activation: one tab stop, arrows move and select, Home/End jump.
 * Underline style (2px ink), the way Linear and Vercel mark the current view.
 */
export function Tabs<T extends string>({
  items,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
  listClassName,
  panelClassName,
}: TabsProps<T>) {
  const base = useId();
  const [inner, setInner] = useState<T | undefined>(defaultValue ?? items[0]?.value);
  const active = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const disabled = items.map((i) => Boolean(i.disabled));
  const activeIdx = Math.max(
    0,
    items.findIndex((i) => i.value === active),
  );

  const select = (idx: number) => {
    const item = items[idx];
    if (!item || item.disabled) return;
    if (value === undefined) setInner(item.value);
    onValueChange?.(item.value);
    refs.current[idx]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const map: Record<string, () => number> = {
      ArrowRight: () => nextEnabledIndex(disabled, idx, 1),
      ArrowLeft: () => nextEnabledIndex(disabled, idx, -1),
      Home: () => nextEnabledIndex(disabled, -1, 1),
      End: () => nextEnabledIndex(disabled, items.length, -1),
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    select(fn());
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className={cx(
          "flex items-center gap-4 overflow-x-auto border-b border-rule",
          listClassName,
        )}
      >
        {items.map((item, idx) => {
          const selected = idx === activeIdx;
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[idx] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${idx}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${idx}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => select(idx)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              className={cx(
                "relative -mb-px inline-flex h-9 items-center gap-1.5 border-b-2 text-ui font-medium whitespace-nowrap transition-colors duration-100",
                "disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {item.label}
              {typeof item.count === "number" ? (
                <span className="figures rounded-[4px] bg-sunken px-1 text-2xs text-ink-muted">
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {items.map((item, idx) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${base}-panel-${idx}`}
          aria-labelledby={`${base}-tab-${idx}`}
          hidden={idx !== activeIdx}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA tabs pattern makes the panel focusable
          tabIndex={0}
          className={cx("pt-4 focus-visible:outline-offset-4", panelClassName)}
        >
          {idx === activeIdx ? item.content : null}
        </div>
      ))}
    </div>
  );
}
