import { cx } from "../ui/cx";

/**
 * The mark: a solid disc and the outline it casts. Shadow is the second shape, slightly behind
 * and to the side of the person it learns from. The cast outline is the brand colour.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cx("size-5 shrink-0", className)}
    >
      <circle cx="14.5" cy="14.5" r="7" fill="none" stroke="var(--sd-brand)" strokeWidth="2" />
      <circle cx="9.5" cy="9.5" r="7" fill="currentColor" />
    </svg>
  );
}

/** Mark + name, 15px semibold sans. Used in the sidebar and the marketing header. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <span className="text-[0.9375rem] leading-none font-semibold tracking-[-0.01em]">Shadow</span>
    </span>
  );
}
