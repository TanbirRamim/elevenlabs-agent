import type { ReactNode } from "react";
import { cx } from "./cx";

export type SectionHeadingProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Heading level; the visual size stays the same. */
  as?: "h2" | "h3";
  id?: string;
  className?: string;
};

/** Marketing-page section heading (landing, demo): 24–30px semibold sans. Not for in-app pages. */
export function SectionHeading({
  title,
  description,
  as: Heading = "h2",
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cx("max-w-[36rem]", className)}>
      <Heading
        id={id}
        className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance text-ink sm:text-[1.75rem]"
      >
        {title}
      </Heading>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-pretty text-ink-muted">{description}</p>
      ) : null}
    </div>
  );
}
