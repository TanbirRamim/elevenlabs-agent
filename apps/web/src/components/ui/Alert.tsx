import { CircleAlert, CircleCheck, Info, ShieldAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

export type AlertTone = "info" | "ok" | "guard" | "danger" | "offline";

const TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-rule bg-sunken text-ink", icon: <Info className="text-ink-muted" /> },
  ok: { box: "border-ok/25 bg-ok-wash text-ink", icon: <CircleCheck className="text-ok" /> },
  guard: {
    box: "border-guard/30 bg-guard-wash text-ink",
    icon: <ShieldAlert className="text-guard-text" />,
  },
  danger: {
    box: "border-danger/25 bg-danger-wash text-ink",
    icon: <CircleAlert className="text-danger" />,
  },
  offline: { box: "border-rule bg-sunken text-ink", icon: <WifiOff className="text-ink-muted" /> },
};

export type AlertProps = {
  tone?: AlertTone;
  title: ReactNode;
  children?: ReactNode;
  /** Retry or fix action, right-aligned on wide screens. */
  action?: ReactNode;
  className?: string;
};

/**
 * An inline message about the state of this view: an error with a fix, an offline API,
 * a guardrail notice. `danger` and `offline` announce themselves (role="alert").
 */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  const t = TONES[tone];
  const urgent = tone === "danger" || tone === "offline";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cx(
        "flex flex-col gap-3 rounded-panel border px-3.5 py-3 sm:flex-row sm:items-start",
        t.box,
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.75]">
        {t.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium">{title}</p>
        {children ? <div className="mt-0.5 text-ui text-ink-muted">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
