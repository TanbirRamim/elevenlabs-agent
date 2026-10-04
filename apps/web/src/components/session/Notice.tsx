import { CircleAlert, Info } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../ui/cx";

export type NoticeProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  /** `problem` for something that failed, `info` for a neutral heads-up. */
  tone?: "problem" | "info";
  /** Optional actions, e.g. "Try again", set under the message. */
  actions?: ReactNode;
};

/**
 * A calm inline notice: a hairline box with a thin status rule on the left. The words carry the
 * meaning; the stop colour is only a cue. Used for errors instead of red walls.
 */
export function Notice({ tone = "problem", actions, className, children, ...rest }: NoticeProps) {
  const Icon = tone === "problem" ? CircleAlert : Info;
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-control border border-rule bg-surface py-3 pr-4 pl-5",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute inset-y-0 left-0 w-0.5",
          tone === "problem" ? "bg-danger" : "bg-rule-strong",
        )}
      />
      <div className="flex gap-3">
        <Icon
          aria-hidden="true"
          className={cx(
            "mt-0.5 size-4 shrink-0 stroke-[1.75]",
            tone === "problem" ? "text-danger" : "text-ink-faint",
          )}
        />
        <div className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed text-ink">
          {children}
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
