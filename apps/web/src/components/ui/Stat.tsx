import type { ReactNode } from "react";
import { cx } from "./cx";

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  /** Unit or denominator set smaller after the value ("/ 12", "%"). */
  unit?: ReactNode;
  /** Source or qualifier under the value. */
  note?: ReactNode;
  /** A trend or delta chip. Colour it by meaning only (ok/danger), never for decoration. */
  delta?: ReactNode;
  className?: string;
};

/** A real figure and what it counts: label on top, value in tabular figures. */
export function Stat({ label, value, unit, note, delta, className }: StatProps) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1 bg-surface px-4 py-3", className)}>
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="figures text-2xl leading-8 font-semibold tracking-tight text-ink">
          {value}
        </span>
        {unit ? <span className="figures text-ui text-ink-faint">{unit}</span> : null}
        {delta ? <span className="ml-auto self-center">{delta}</span> : null}
      </dd>
      {note ? <dd className="truncate text-xs text-ink-faint">{note}</dd> : null}
    </div>
  );
}

/** A row of stat tiles sharing one border, divided by hairlines (Linear/Vercel style). */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cx(
        "grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-rule bg-rule",
        "sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none",
        "[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
        className,
      )}
    >
      {children}
    </dl>
  );
}
