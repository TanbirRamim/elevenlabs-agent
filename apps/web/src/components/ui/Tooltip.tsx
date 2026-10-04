"use client";

import {
  cloneElement,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";
import { KbdCombo } from "./Kbd";

type TriggerProps = {
  "aria-describedby"?: string;
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
};

export type TooltipProps = {
  /** Short text: a label or a one-line explanation. Never interactive content. */
  content: ReactNode;
  /** Optional shortcut hint shown after the text, e.g. ["⌘", "K"]. */
  shortcut?: readonly string[];
  side?: "top" | "bottom" | "right";
  /** One focusable element (a button or link). It gets aria-describedby. */
  children: ReactElement<TriggerProps>;
  className?: string;
};

const SIDE = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  right: "top-1/2 left-full ml-1.5 -translate-y-1/2",
} as const;

/**
 * A label on hover (after 300ms) and immediately on keyboard focus. Escape dismisses it
 * (WCAG 1.4.13). The trigger keeps its own accessible name; the tooltip only describes it.
 */
export function Tooltip({ content, shortcut, side = "top", children, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const p = children.props;
  const trigger = cloneElement(children, {
    "aria-describedby":
      [p["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined,
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      p.onPointerEnter?.(e);
      clear();
      timer.current = setTimeout(() => setOpen(true), 300);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      p.onPointerLeave?.(e);
      clear();
      setOpen(false);
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      p.onFocus?.(e);
      if (e.currentTarget.matches(":focus-visible")) setOpen(true);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      p.onBlur?.(e);
      clear();
      setOpen(false);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      p.onKeyDown?.(e);
      if (e.key === "Escape") setOpen(false);
    },
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cx(
            "pointer-events-none absolute z-50 flex w-max max-w-64 animate-fade-in items-center gap-2 rounded-control bg-ink px-2 py-1 text-xs font-medium text-ink-inverse shadow-overlay",
            SIDE[side],
            className,
          )}
        >
          {content}
          {shortcut ? (
            <KbdCombo
              keys={shortcut}
              className="[&_kbd]:border-ink-inverse/25 [&_kbd]:bg-transparent [&_kbd]:text-ink-inverse/80 [&_kbd]:shadow-none"
            />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
