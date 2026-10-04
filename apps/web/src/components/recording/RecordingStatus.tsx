import { EyeOff, Pause } from "lucide-react";
import { cx } from "../ui/cx";
import { formatElapsed } from "./logic";

export type RecordingState = "recording" | "paused" | "off-record" | "idle";

export type RecordingStatusProps = {
  state: RecordingState;
  elapsedMs: number;
  className?: string;
};

/**
 * Compact pill for the shell's TopBarStatus slot: "REC 04:12", "Paused 04:12", "Not recording".
 * Red only while recording is live.
 */
export function RecordingStatus({ state, elapsedMs, className }: RecordingStatusProps) {
  const time = formatElapsed(elapsedMs);
  const base =
    "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-xs font-medium whitespace-nowrap";
  if (state === "recording") {
    return (
      <span
        role="status"
        aria-label={`Recording, ${time}`}
        className={cx(base, "border-transparent bg-rec-wash text-rec-text", className)}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-rec animate-rec-pulse" />
        <span aria-hidden="true" className="font-semibold">
          REC
        </span>
        <span aria-hidden="true" className="figures font-mono">
          {time}
        </span>
      </span>
    );
  }
  if (state === "paused") {
    return (
      <span
        role="status"
        aria-label={`Recording paused, ${time}`}
        className={cx(base, "border-rule-strong bg-surface text-ink", className)}
      >
        <Pause aria-hidden="true" className="size-3 stroke-2" />
        <span aria-hidden="true">Paused</span>
        <span aria-hidden="true" className="figures font-mono text-ink-muted">
          {time}
        </span>
      </span>
    );
  }
  return (
    <span role="status" className={cx(base, "border-rule bg-sunken text-ink-muted", className)}>
      {state === "off-record" ? <EyeOff aria-hidden="true" className="size-3 stroke-2" /> : null}
      {state === "off-record" ? "Off the record" : "Not recording"}
    </span>
  );
}
