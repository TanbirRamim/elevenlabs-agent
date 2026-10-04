import type { ReactNode } from "react";
import { cx } from "./cx";

export type EmptyStateProps = {
  /** A lucide icon, shown at 20px in a quiet square. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** One primary next step, optionally a secondary one. */
  action?: ReactNode;
  className?: string;
  /** `inline` for inside a panel, `page` for a whole empty view. */
  size?: "inline" | "page";
};

/** Says what is empty, why, and the one thing to do next. Left-aligned inside panels. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = "inline",
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-start gap-3",
        size === "page" ? "mx-auto max-w-md items-center py-16 text-center" : "py-6",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-panel border border-rule bg-sunken text-ink-muted [&_svg]:size-5 [&_svg]:stroke-[1.5]"
        >
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? (
          <p className="max-w-prose text-ui text-pretty text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
