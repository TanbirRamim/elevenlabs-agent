import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-out " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-45 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-canvas hover:bg-ink/88",
  secondary: "border border-rule-strong bg-transparent text-ink hover:border-ink hover:bg-surface",
  ghost: "bg-transparent text-ink-muted hover:bg-sunken hover:text-ink",
};

// Every size keeps at least a 40px hit area; md and lg meet the 44px touch minimum.
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3 text-sm",
  md: "min-h-11 px-4 text-[0.9375rem]",
  lg: "min-h-12 px-5 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** A real <button>. Defaults to type="button" so it never submits a form by accident. */
export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...rest} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** Navigation that looks like a button. It stays a link for the accessibility tree. */
export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...rest} />;
}
