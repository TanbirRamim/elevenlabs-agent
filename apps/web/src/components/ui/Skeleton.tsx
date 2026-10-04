import { cx } from "./cx";

/** A loading placeholder in the shape of the content it stands in for. Hidden from readers. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "animate-shimmer rounded-control bg-sunken motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** N text lines, the last one shorter. Wrap loading regions in aria-busy with a visible label. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows have no identity
          key={i}
          className={cx("h-3", i === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}
