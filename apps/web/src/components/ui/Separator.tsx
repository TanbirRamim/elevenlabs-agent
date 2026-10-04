import { cx } from "./cx";

/** A hairline. Decorative by default; pass `semantic` when it separates content for readers. */
export function Separator({
  orientation = "horizontal",
  semantic = false,
  className,
}: {
  orientation?: "horizontal" | "vertical";
  semantic?: boolean;
  className?: string;
}) {
  const cls = cx(
    "shrink-0 bg-rule",
    orientation === "horizontal" ? "h-px w-full" : "h-full w-px self-stretch",
    className,
  );
  if (semantic) {
    return <hr aria-orientation={orientation} className={cx(cls, "border-0")} />;
  }
  return <div aria-hidden="true" className={cls} />;
}
