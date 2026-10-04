import { EyeOff, ShieldCheck, ShieldOff } from "lucide-react";
import { cx } from "../ui/cx";
import { Spinner } from "../ui/Spinner";

export type RedactionState = "active" | "pending" | "off";

export type PrivacyIndicatorProps = {
  redaction: RedactionState;
  offRecord: boolean;
  className?: string;
};

const PILL =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:stroke-[1.75]";

/** Whether personal data is being redacted, and whether the session is off the record. */
export function PrivacyIndicator({ redaction, offRecord, className }: PrivacyIndicatorProps) {
  return (
    <span role="status" className={cx("inline-flex flex-wrap items-center gap-1.5", className)}>
      {redaction === "active" ? (
        <span className={cx(PILL, "border-transparent bg-ok-wash text-ok")}>
          <ShieldCheck aria-hidden="true" />
          Redaction on
        </span>
      ) : redaction === "pending" ? (
        <span className={cx(PILL, "border-rule bg-sunken text-ink-muted")}>
          <Spinner className="size-3" />
          Redaction starting
        </span>
      ) : (
        <span className={cx(PILL, "border-transparent bg-danger-wash text-danger")}>
          <ShieldOff aria-hidden="true" />
          Redaction off
        </span>
      )}
      {offRecord ? (
        <span className={cx(PILL, "border-rule bg-sunken text-ink-muted")}>
          <EyeOff aria-hidden="true" />
          Off the record
        </span>
      ) : null}
    </span>
  );
}
