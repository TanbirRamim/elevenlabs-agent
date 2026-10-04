import { ChevronDown } from "lucide-react";
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { cx } from "./cx";

const CONTROL =
  "w-full rounded-control border border-rule-strong bg-surface text-ui text-ink shadow-raised " +
  "placeholder:text-ink-faint transition-[border-color,box-shadow] duration-100 " +
  "hover:border-ink-faint/60 focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25 " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60 " +
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/25";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Leading icon, decorative (e.g. a search glass). */
  icon?: ReactNode;
};

/** A 32px single-line input. Label it with <Field> or aria-label. */
export function Input({ className, icon, ...rest }: InputProps) {
  if (!icon) {
    return <input className={cx(CONTROL, "h-8 px-2.5 pointer-coarse:h-10", className)} {...rest} />;
  }
  return (
    <span className="relative flex w-full items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 text-ink-faint [&_svg]:size-4 [&_svg]:stroke-[1.75]"
      >
        {icon}
      </span>
      <input className={cx(CONTROL, "h-8 pr-2.5 pl-8 pointer-coarse:h-10", className)} {...rest} />
    </span>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(CONTROL, "min-h-20 resize-y px-2.5 py-2 leading-relaxed", className)}
      {...rest}
    />
  );
}

/** A styled native <select>: the platform picker is the most accessible one there is. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative flex w-full items-center">
      <select
        className={cx(CONTROL, "h-8 appearance-none pr-8 pl-2.5 pointer-coarse:h-10", className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 size-4 stroke-[1.75] text-ink-faint"
      />
    </span>
  );
}

export type FieldProps = {
  label: ReactNode;
  /** Help text under the control. */
  hint?: ReactNode;
  /** Error text; also marks the control invalid via the render prop's aria props. */
  error?: ReactNode;
  className?: string;
  /** Render the control with the ids and aria wiring it needs. */
  children: (control: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactNode;
};

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-ui font-medium text-ink">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
