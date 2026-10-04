import type { ReactNode } from "react";
import { cx } from "./cx";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Small row above the title: a status pill, an id, a version. */
  meta?: ReactNode;
  /** Page-level actions, right-aligned on wide screens. */
  actions?: ReactNode;
  className?: string;
};

/**
 * The h1 of an in-app page: 20px semibold, one line of description, actions on the right.
 * Product scale, not hero scale. The top bar already shows where you are.
 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cx(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        {meta ? <div className="mb-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em] text-balance text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-ui text-pretty text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A heading for a section inside a page (h2, 14px semibold) with optional actions. */
export function SectionTitle({
  title,
  description,
  actions,
  id,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cx("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <Heading id={id} className="text-sm font-semibold text-ink">
          {title}
        </Heading>
        {description ? <p className="mt-0.5 text-ui text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}
