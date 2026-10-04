import type { ReactNode } from "react";
import { cx } from "./cx";

export type StatProps = {
  value: ReactNode;
  label: ReactNode;
  /** Optional source or qualifier, set in mono under the label. */
  note?: ReactNode;
  className?: string;
};

/** A figure and what it counts. Use it for real numbers only; never for decoration. */
export function Stat({ value, label, note, className }: StatProps) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <dt className="order-2 text-[0.9375rem] leading-snug text-ink-muted">{label}</dt>
      <dd className="order-1 font-display text-5xl leading-none font-normal tracking-[-0.02em] tabular-nums text-ink">
        {value}
      </dd>
      {note ? <dd className="order-3 font-mono text-xs text-ink-faint">{note}</dd> : null}
    </div>
  );
}

/** Wraps Stats in the description list they belong to. */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx("grid gap-8 sm:grid-cols-3", className)}>{children}</dl>;
}
