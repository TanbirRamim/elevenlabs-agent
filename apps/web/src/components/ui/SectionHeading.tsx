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

export function SectionHeading({
  title,
  description,
  as: Heading = "h2",
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cx("max-w-[38rem]", className)}>
      <Heading
        id={id}
        className="font-display text-[2rem] leading-[1.1] font-normal tracking-[-0.015em] text-balance text-ink sm:text-[2.5rem]"
      >
        {title}
      </Heading>
      {description ? (
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
