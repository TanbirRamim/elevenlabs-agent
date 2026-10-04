import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** `raised` only when the card sits above other content; most cards are `flat`. */
  elevation?: "flat" | "raised";
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING = { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" } as const;

export function Card({ elevation = "flat", padding = "md", className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-panel border border-rule bg-surface",
        elevation === "raised" && "shadow-raised",
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}
