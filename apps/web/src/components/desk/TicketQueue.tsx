import type { PublicTicket } from "@shadow/schema";
import { cx } from "../ui";
import { ACTION_LABELS, type CommittedAction } from "./ActionBar";
import { formatEur, isRiskTag, PLAN_LABELS } from "./TicketDetail";

interface TicketQueueProps {
  tickets: PublicTicket[];
  selectedId: string | null;
  committed: Record<string, CommittedAction>;
  /** The ticket whose save Singoda AI is holding right now, if any. */
  heldId?: string | null;
  onSelect: (id: string) => void;
}

/** DOM id of a queue row, so keyboard navigation can move focus with the selection. */
export function queueItemId(ticketId: string): string {
  return `desk-queue-${ticketId}`;
}

type RowStatus = { label: string; dot: string; text: string };

function rowStatus(done: CommittedAction | undefined, held: boolean): RowStatus {
  if (held) return { label: "Held", dot: "bg-guard", text: "text-guard-text" };
  if (!done) return { label: "Open", dot: "bg-ink-faint", text: "text-ink-faint" };
  if (done.approvalRequested) {
    return {
      label: `Done: ${ACTION_LABELS[done.outcome]}, awaiting approval`,
      dot: "bg-guard",
      text: "text-guard-text",
    };
  }
  return { label: `Done: ${ACTION_LABELS[done.outcome]}`, dot: "bg-ok-fill", text: "text-ok" };
}

/**
 * The queue never shows personal data: the customer is described by plan and VIP status, so the
 * list stays readable in captured frames without blurred blocks.
 */
export function TicketQueue({
  tickets,
  selectedId,
  committed,
  heldId = null,
  onSelect,
}: TicketQueueProps) {
  return (
    <nav aria-label="Ticket queue" className="min-w-0">
      <ul className="flex flex-col">
        {tickets.map((ticket) => {
          const done = committed[ticket.id];
          const selected = ticket.id === selectedId;
          const status = rowStatus(done, heldId === ticket.id);
          const risk = ticket.tags.filter(isRiskTag);
          return (
            <li key={ticket.id} className="border-b border-rule last:border-b-0">
              <button
                id={queueItemId(ticket.id)}
                type="button"
                onClick={() => onSelect(ticket.id)}
                aria-current={selected ? "true" : undefined}
                className={cx(
                  "relative flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left text-ink @3xl:px-4",
                  selected ? "bg-selected" : "hover:bg-hover",
                )}
              >
                {selected ? (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />
                ) : null}
                <span className="flex w-full items-center gap-2">
                  <span className="font-mono text-xs text-ink-muted">{ticket.id}</span>
                  <span className={cx("flex min-w-0 items-center gap-1.5 text-xs", status.text)}>
                    <span
                      aria-hidden="true"
                      className={cx("size-1.5 shrink-0 rounded-full", status.dot)}
                    />
                    <span className="truncate">{status.label}</span>
                  </span>
                  {ticket.amountEur !== undefined ? (
                    <span className="figures ml-auto text-xs font-medium text-ink">
                      {formatEur(ticket.amountEur)}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "w-full truncate text-ui",
                    selected || !done ? "font-medium" : "text-ink-muted",
                  )}
                >
                  {ticket.subject}
                </span>
                <span className="flex w-full min-w-0 items-center gap-1.5 text-xs text-ink-faint">
                  <span className="truncate">
                    {PLAN_LABELS[ticket.customer.plan]}
                    {ticket.customer.vip ? ", VIP" : ""}
                    {ticket.tags.filter((t) => !isRiskTag(t)).length > 0
                      ? ` · ${ticket.tags.filter((t) => !isRiskTag(t)).join(", ")}`
                      : ""}
                  </span>
                  {risk.map((t) => (
                    <span
                      key={t}
                      className="inline-flex h-4 shrink-0 items-center rounded-[4px] bg-danger-wash px-1 text-2xs font-medium text-danger"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
