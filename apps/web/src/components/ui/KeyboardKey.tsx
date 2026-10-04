import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** A single key or chord, e.g. <KeyboardKey>Alt</KeyboardKey>+<KeyboardKey>O</KeyboardKey>. */
export function KeyboardKey({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cx(
        "inline-flex min-w-6 items-center justify-center rounded-[0.3rem] border border-rule-strong border-b-2",
        "bg-surface px-1.5 font-mono text-[0.8125rem] leading-5 text-ink",
        className,
      )}
      {...rest}
    />
  );
}
