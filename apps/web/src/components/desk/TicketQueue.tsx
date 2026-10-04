import type { PublicTicket } from "@shadow/schema";
import { ACTION_LABELS, type CommittedAction } from "./ActionBar";
import { TagList } from "./TicketDetail";

interface TicketQueueProps {
  tickets: PublicTicket[];
  selectedId: string | null;
  committed: Record<string, CommittedAction>;
  onSelect: (id: string) => void;
}

export function TicketQueue({ tickets, selectedId, committed, onSelect }: TicketQueueProps) {
  return (
    <nav aria-label="Ticket queue" className="flex flex-col gap-2">
      {tickets.map((ticket) => {
        const done = committed[ticket.id];
        const selected = ticket.id === selectedId;
        return (
          <button
            key={ticket.id}
            type="button"
            onClick={() => onSelect(ticket.id)}
            aria-current={selected ? "true" : undefined}
            className={`flex flex-col items-start gap-1 rounded border-2 px-3 py-2 text-left ${
              selected
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-900 hover:border-neutral-500"
            }`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold">{ticket.id}</span>
              {done ? (
                <span className="rounded bg-green-200 px-1.5 py-0.5 text-sm font-semibold text-green-900">
                  ✓ {ACTION_LABELS[done.outcome]}
                </span>
              ) : null}
            </span>
            <span className="text-lg font-semibold leading-snug">{ticket.subject}</span>
            <TagList tags={ticket.tags} />
          </button>
        );
      })}
    </nav>
  );
}
