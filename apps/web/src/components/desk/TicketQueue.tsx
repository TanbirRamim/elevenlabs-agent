import type { PublicTicket } from "@shadow/schema";
import { Badge, cx } from "../ui";
import { ACTION_LABELS, type CommittedAction } from "./ActionBar";
import { formatEur, PLAN_LABELS, TagList } from "./TicketDetail";

interface TicketQueueProps {
  tickets: PublicTicket[];
  selectedId: string | null;
  committed: Record<string, CommittedAction>;
  onSelect: (id: string) => void;
}

/**
 * The queue never shows personal data: the customer is described by plan and VIP status, so the
 * list stays readable in captured frames without blurred blocks.
 */
export function TicketQueue({ tickets, selectedId, committed, onSelect }: TicketQueueProps) {
  return (
    <nav aria-label="Ticket queue" className="min-w-0">
      <ul className="flex flex-col divide-y divide-rule">
        {tickets.map((ticket) => {
          const done = committed[ticket.id];
          const selected = ticket.id === selectedId;
          return (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => onSelect(ticket.id)}
                aria-current={selected ? "true" : undefined}
                className={cx(
                  "flex w-full flex-col items-start gap-2 px-4 py-3.5 text-left text-ink",
                  selected
                    ? "bg-surface shadow-[inset_4px_0_0_var(--sd-ink)]"
                    : "hover:bg-surface/60",
                )}
              >
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="font-mono text-sm text-ink-faint">{ticket.id}</span>
                  {ticket.amountEur !== undefined ? (
                    <span className="text-[0.9375rem] font-semibold tabular-nums text-ink">
                      {formatEur(ticket.amountEur)}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "text-[1.0625rem] leading-snug text-pretty",
                    selected ? "font-semibold" : "font-medium",
                  )}
                >
                  {ticket.subject}
                </span>
                <span className="text-[0.9375rem] text-ink-muted">
                  {PLAN_LABELS[ticket.customer.plan]}
                  {ticket.customer.vip ? ", VIP" : ""}
                </span>
                <TagList tags={ticket.tags} size="sm" />
                {done ? (
                  <Badge
                    tone={done.approvalRequested ? "guard" : "ok"}
                    dot
                    className="text-sm! font-semibold"
                  >
                    Done: {ACTION_LABELS[done.outcome]}
                    {done.approvalRequested ? ", awaiting approval" : ""}
                  </Badge>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
