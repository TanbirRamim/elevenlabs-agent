import { cx } from "@/components/ui/cx";

/**
 * The mark: a solid disc and the outline it casts. Shadow is the second shape,
 * always slightly behind and to the side of the person it learns from.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cx("size-6 shrink-0", className)}
    >
      <circle cx="14.5" cy="14.5" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="9.5" cy="9.5" r="7.25" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <span className="font-display text-[1.375rem] leading-none font-medium tracking-[-0.01em]">
        Shadow
      </span>
    </span>
  );
}
