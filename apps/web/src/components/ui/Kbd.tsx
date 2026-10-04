import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** A single key, e.g. <Kbd>⌘</Kbd>. Mono, 20px tall, quiet. */
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-rule-strong bg-surface px-1",
        "font-mono text-2xs font-medium text-ink-muted shadow-[0_1px_0_var(--sd-rule-strong)]",
        className,
      )}
      {...rest}
    />
  );
}

/** Kept for existing call sites. */
export const KeyboardKey = Kbd;

/** A chord or sequence: <KbdCombo keys={["⌘", "K"]} />. Screen readers hear "⌘ K". */
export function KbdCombo({
  keys,
  className,
  sequence = false,
}: {
  keys: readonly string[];
  className?: string;
  /** Sequence ("G then C") rather than a chord. */
  sequence?: boolean;
}) {
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)}>
      {keys.map((k, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: keys can repeat (G then G); position is the identity
        <span key={`${k}-${i}`} className="inline-flex items-center gap-0.5">
          {sequence && i > 0 ? <span className="px-0.5 text-2xs text-ink-faint">then</span> : null}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}
