"use client";

import { useEffect, useReducer, useRef } from "react";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Kbd } from "../ui/Kbd";
import { countdownReducer } from "./logic";

export type CountdownProps = {
  /** Seconds to count from. Default 3. */
  from?: number;
  /** Called once when the count reaches zero or is skipped. */
  onDone: () => void;
  /** Called when the user skips (before onDone). */
  onSkip?: () => void;
  /** Pause the count without resetting it. Default true. */
  running?: boolean;
  className?: string;
};

/**
 * 3-2-1 before recording starts. Skippable with the button, Enter or Escape. Each number is
 * announced; with reduced motion the numeral simply changes.
 */
export function Countdown({ from = 3, onDone, onSkip, running = true, className }: CountdownProps) {
  const [state, dispatch] = useReducer(countdownReducer, {
    remaining: Math.max(0, Math.floor(from)),
    done: from <= 0,
  });
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // biome-ignore lint/correctness/useExhaustiveDependencies: each new number schedules the next one-second tick
  useEffect(() => {
    if (!running || state.done) return;
    const t = setTimeout(() => dispatch({ type: "tick" }), 1000);
    return () => clearTimeout(t);
  }, [running, state.done, state.remaining]);

  useEffect(() => {
    if (state.done && !doneRef.current) {
      doneRef.current = true;
      onDoneRef.current();
    }
  }, [state.done]);

  const skip = () => {
    if (state.done) return;
    onSkip?.();
    dispatch({ type: "skip" });
  };
  const skipRef = useRef(skip);
  skipRef.current = skip;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        skipRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={cx("flex flex-col items-center gap-4", className)}>
      <p className="text-ui text-ink-muted">Recording starts in</p>
      <span
        key={state.remaining}
        role="timer"
        aria-live="assertive"
        aria-atomic="true"
        className="figures font-mono text-5xl leading-none font-semibold text-ink motion-safe:animate-pop-in"
      >
        {state.remaining}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={skip}
        trailing={
          <span aria-hidden="true">
            <Kbd>Enter</Kbd>
          </span>
        }
      >
        Skip
      </Button>
    </div>
  );
}
