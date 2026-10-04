import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cx } from "./cx";

/** A dense data table: 36px rows, sticky sunken header, hairline rows, hover highlight. */
export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cx("w-full border-collapse text-left text-ui", className)} {...rest} />
    </div>
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx("bg-sunken", className)} {...rest} />;
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cx("divide-y divide-rule", className)} {...rest} />;
}

export function Tr({
  className,
  selected = false,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cx(
        "transition-colors duration-100 hover:bg-hover",
        selected && "bg-selected",
        className,
      )}
      {...rest}
    />
  );
}

export function Th({
  className,
  numeric = false,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cx(
        "h-8 border-b border-rule px-3 text-xs font-medium whitespace-nowrap text-ink-muted",
        numeric && "text-right",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({
  className,
  numeric = false,
  mono = false,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; mono?: boolean }) {
  return (
    <td
      className={cx(
        "h-9 px-3 align-middle text-ink",
        numeric && "figures text-right",
        mono && "font-mono text-xs text-ink-muted",
        className,
      )}
      {...rest}
    />
  );
}
