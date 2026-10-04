import { Check, RotateCw, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Spinner } from "../ui/Spinner";
import { type PreflightStatus, summarizePreflight } from "./logic";

/**
 * One check before recording. Conventional ids: `mic` (microphone permission), `screen`
 * (screen share), `agent` (voice agent connected), `redaction` (privacy redaction active).
 */
export type PreflightItem = {
  id: string;
  label: string;
  status: PreflightStatus;
  /** Short state detail, e.g. "MacBook Pro Microphone". */
  detail?: ReactNode;
  /** What to do when the check failed. Shown only on failure. */
  fixHint?: ReactNode;
  /** An inline action, e.g. a "Share screen" button. */
  action?: ReactNode;
};

export type PreflightChecklistProps = {
  items: readonly PreflightItem[];
  title?: string;
  onRetry?: () => void;
  className?: string;
};

const STATUS_WORD: Record<PreflightStatus, string> = {
  pending: "Checking",
  ok: "Ready",
  failed: "Needs attention",
};

export function PreflightChecklist({
  items,
  title = "Before you record",
  onRetry,
  className,
}: PreflightChecklistProps) {
  const s = summarizePreflight(items);
  const summary = s.ready
    ? "Ready to record"
    : `${s.ok} of ${s.total} ready${s.failed ? `, ${s.failed} need${s.failed === 1 ? "s" : ""} attention` : ""}`;

  return (
    <section
      aria-label={title}
      className={cx("rounded-panel border border-rule bg-surface", className)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-ui font-semibold text-ink">{title}</h2>
          <p
            className={cx(
              "text-xs",
              s.ready ? "text-ok" : s.failed ? "text-danger" : "text-ink-muted",
            )}
            aria-live="polite"
          >
            {summary}
          </p>
        </div>
        {onRetry && s.failed > 0 ? (
          <Button size="sm" variant="ghost" icon={<RotateCw />} onClick={onRetry}>
            Check again
          </Button>
        ) : null}
      </header>
      <ul aria-label="Preflight checks" className="divide-y divide-rule">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
            <span
              aria-hidden="true"
              className={cx(
                "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                item.status === "ok" && "bg-ok-wash text-ok",
                item.status === "failed" && "bg-danger-wash text-danger",
                item.status === "pending" && "text-ink-faint",
              )}
            >
              {item.status === "ok" ? (
                <Check className="size-3 stroke-[2.5]" />
              ) : item.status === "failed" ? (
                <X className="size-3 stroke-[2.5]" />
              ) : (
                <Spinner className="size-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-ui">
                <span className="font-medium text-ink">{item.label}</span>
                <span
                  className={cx(
                    "text-xs",
                    item.status === "ok"
                      ? "text-ok"
                      : item.status === "failed"
                        ? "text-danger"
                        : "text-ink-faint",
                  )}
                >
                  {STATUS_WORD[item.status]}
                </span>
              </p>
              {item.detail ? <p className="text-xs text-ink-muted">{item.detail}</p> : null}
              {item.status === "failed" && item.fixHint ? (
                <p className="mt-1 text-xs text-ink-muted">{item.fixHint}</p>
              ) : null}
            </div>
            {item.action ? <div className="shrink-0">{item.action}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
