import { cx } from "./cx";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const SIZES = { xs: "size-5 text-[9px]", sm: "size-6 text-2xs", md: "size-8 text-xs" } as const;

/**
 * A person: initials on a neutral disc. `shadow` renders Singoda AI itself in the brand colour,
 * the one place the brand marks an identity.
 */
export function Avatar({
  name,
  size = "sm",
  shadow = false,
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  shadow?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        shadow ? "bg-brand text-brand-ink" : "bg-selected text-ink-muted",
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true">{shadow ? "S" : initials(name)}</span>
    </span>
  );
}
