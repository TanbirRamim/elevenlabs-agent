import { MessageCircleQuestion, MicOff } from "lucide-react";
import { cx } from "../ui/cx";

export type ListeningState = "listening" | "asking" | "quiet" | "off";

export type ListeningIndicatorProps = {
  state: ListeningState;
  /** Icon and bars only, label kept for screen readers. */
  compact?: boolean;
  className?: string;
};

export const LISTENING_LABEL: Record<ListeningState, string> = {
  listening: "Singoda AI is listening",
  asking: "Singoda AI is asking",
  quiet: "Singoda AI is quiet",
  off: "Voice off",
};

/** What Singoda AI's voice is doing right now. Brand colour (ask) only when it listens or asks. */
export function ListeningIndicator({ state, compact = false, className }: ListeningIndicatorProps) {
  const voiced = state === "listening" || state === "asking";
  return (
    <span
      role="status"
      aria-label={compact ? LISTENING_LABEL[state] : undefined}
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border text-xs font-medium whitespace-nowrap",
        compact ? "px-1.5" : "px-2.5",
        voiced
          ? "border-transparent bg-ask-wash text-ask-text"
          : "border-rule bg-sunken text-ink-muted",
        className,
      )}
    >
      {state === "listening" ? (
        <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-full w-[2px] origin-bottom rounded-full bg-ask motion-safe:animate-shimmer"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      ) : state === "asking" ? (
        <MessageCircleQuestion aria-hidden="true" className="size-3.5 stroke-[1.75]" />
      ) : state === "off" ? (
        <MicOff aria-hidden="true" className="size-3.5 stroke-[1.75]" />
      ) : (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-faint" />
      )}
      {compact ? null : LISTENING_LABEL[state]}
    </span>
  );
}
