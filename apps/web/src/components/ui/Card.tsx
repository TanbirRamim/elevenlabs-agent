import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** `raised` only when the card sits above other content; most cards are `flat` (border only). */
  elevation?: "flat" | "raised";
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING = { none: "", sm: "p-3", md: "p-4", lg: "p-6" } as const;

/** A bordered object: a ticket, a transcript, a step. Borders over shadows. */
export function Card({ elevation = "flat", padding = "md", className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-panel border border-rule bg-surface",
        elevation === "raised" && "shadow-overlay",
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}

export type PanelProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** Panel title, 13px semibold. Becomes the region's accessible name. */
  title?: ReactNode;
  /** Short description or count next to the title. */
  meta?: ReactNode;
  /** Controls on the right of the header (ghost buttons, a segmented control). */
  actions?: ReactNode;
  /** Footer row, set on sunken. */
  footer?: ReactNode;
  /** Remove body padding (tables, lists that run edge to edge). */
  flush?: boolean;
  bodyClassName?: string;
};

/**
 * A titled section of a work surface: header (title, meta, actions), body, optional footer.
 * Renders a <section> labelled by its title.
 */
export function Panel({
  title,
  meta,
  actions,
  footer,
  flush = false,
  className,
  bodyClassName,
  children,
  id,
  ...rest
}: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title && headingId ? headingId : undefined}
      className={cx(
        "flex flex-col overflow-hidden rounded-panel border border-rule bg-surface",
        className,
      )}
      {...rest}
    >
      {title || actions ? (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-rule px-4 py-2">
          <div className="flex min-w-0 items-baseline gap-2">
            {title ? (
              <h2 id={headingId} className="truncate text-ui font-semibold text-ink">
                {title}
              </h2>
            ) : null}
            {meta ? <span className="truncate text-xs text-ink-faint">{meta}</span> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx("min-h-0 flex-1", !flush && "p-4", bodyClassName)}>{children}</div>
      {footer ? (
        <footer className="flex items-center gap-3 border-t border-rule bg-sunken px-4 py-2.5 text-xs text-ink-muted">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
