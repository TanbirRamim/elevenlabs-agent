import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium select-none " +
  "transition-[background-color,border-color,color,box-shadow] duration-100 ease-out " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
  "[&_svg]:shrink-0 [&_svg]:stroke-[1.75]";

const VARIANTS: Record<ButtonVariant, string> = {
  // Primary is ink, never the brand colour: the brand means "Singoda AI", not "click here".
  primary: "bg-ink text-ink-inverse shadow-raised hover:bg-ink/85",
  secondary:
    "border border-rule-strong bg-surface text-ink shadow-raised hover:border-ink-faint/60 hover:bg-hover",
  ghost: "text-ink-muted hover:bg-hover hover:text-ink",
  danger: "bg-danger-fill text-white shadow-raised hover:bg-danger-fill/90",
};

// Heights: sm 28px, md 32px, lg 40px. Coarse pointers get a 40px minimum.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-ui [&_svg]:size-3.5 pointer-coarse:h-10",
  md: "h-8 px-3 text-ui [&_svg]:size-4 pointer-coarse:h-10",
  lg: "h-10 px-4 text-sm [&_svg]:size-4",
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "size-7 [&_svg]:size-3.5 pointer-coarse:size-10",
  md: "size-8 [&_svg]:size-4 pointer-coarse:size-10",
  lg: "size-10 [&_svg]:size-[18px]",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  iconOnly = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
} = {}): string {
  return cx(BASE, VARIANTS[variant], iconOnly ? ICON_SIZES[size] : SIZES[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, sets aria-busy and blocks clicks. */
  loading?: boolean;
  /** Leading icon (lucide, decorative). */
  icon?: ReactNode;
  /** Trailing content such as a <Kbd> hint. */
  trailing?: ReactNode;
};

/** A real <button>. Defaults to type="button" so it never submits a form by accident. */
export function Button({
  variant,
  size,
  loading = false,
  icon,
  trailing,
  className,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {trailing}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "icon" | "trailing" | "children"> & {
  /** Required: the accessible name. Also shown as the native tooltip. */
  label: string;
  children: ReactNode;
};

/** An icon-only button. `label` is mandatory because the icon alone has no name. */
export function IconButton({
  variant = "ghost",
  size,
  label,
  loading = false,
  className,
  type = "button",
  disabled,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={buttonClasses({ variant, size, iconOnly: true, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

/** Navigation that looks like a button. It stays a link for the accessibility tree. */
export function ButtonLink({ variant, size, icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
