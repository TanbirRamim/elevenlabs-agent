import type { Outcome, PublicTicket } from "@shadow/schema";
import { Check } from "lucide-react";
import { ACTION_LABELS } from "../desk/ActionBar";
import { cx } from "../ui/cx";
import type { DeskView } from "./script";

/**
 * A still of DeskSim at one moment of the replay, drawn from the script instead of from clicks
 * so any moment can be shown directly when the viewer scrubs. Same tickets (seed), same action
 * labels and the same "Paused by Shadow" state as the live DeskSim; nothing here is clickable,
 * because it is a recording.
 */

/** The actions in play in the demo story, in DeskSim's order. */
const ACTIONS: Outcome[] = [
  "reply",
  "refund",
  "hold_request_info",
  "handoff_security",
  "handoff_legal",
  "handoff_billing_disputes",
];

export function ReplayDesk({ view, queueLabel }: { view: DeskView; queueLabel: string }) {
  const selected = view.tickets.find((t) => t.id === view.selectedId) ?? null;
  return (
    <section
      aria-label={`DeskSim, ${queueLabel}`}
      className="overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <span className="text-sm text-ink-muted">DeskSim, {queueLabel}</span>
        <span className="font-mono text-xs text-ink-faint">Sandbox helpdesk</span>
      </header>
      <div className="grid md:grid-cols-[12.5rem_1fr]">
        <ol
          aria-label="Ticket queue"
          className="grid grid-cols-2 border-b border-rule md:flex md:flex-col md:border-r md:border-b-0"
        >
          {view.tickets.map((t) => {
            const done = view.committed[t.id];
            const current = t.id === view.selectedId;
            return (
              <li
                key={t.id}
                aria-current={current ? "true" : undefined}
                className={cx(
                  "relative flex min-w-0 flex-col gap-0.5 border-rule px-4 py-2.5 odd:border-r md:border-b md:odd:border-r-0",
                  current ? "bg-sunken" : "",
                )}
              >
                {current ? (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />
                ) : null}
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-faint">{t.id}</span>
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-xs text-ok">
                      <Check aria-hidden="true" className="size-3.5" />
                      <span className="max-sm:sr-only">{ACTION_LABELS[done]}</span>
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-sm leading-snug text-ink">{t.subject}</span>
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 px-4 py-4 sm:px-5">
          {selected ? (
            <TicketBody ticket={selected} view={view} />
          ) : (
            <p className="py-10 text-[0.9375rem] text-ink-faint">The queue is open.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function TicketBody({ ticket, view }: { ticket: PublicTicket; view: DeskView }) {
  const c = ticket.customer;
  const committed = view.committed[ticket.id];
  return (
    <article className="flex flex-col gap-3">
      <header>
        <h3 className="text-[1.125rem] leading-snug font-medium text-ink">
          <span className="mr-2 font-mono text-sm text-ink-faint">{ticket.id}</span>
          {ticket.subject}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-muted">
          <span>{c.name}</span>
          <span>{c.plan.charAt(0).toUpperCase() + c.plan.slice(1)} plan</span>
          <span>{c.accountAgeDays} days</span>
          {ticket.amountEur !== undefined ? (
            <span className="font-mono text-[0.8125rem] text-ink">
              €{ticket.amountEur.toFixed(2)}
            </span>
          ) : null}
        </p>
      </header>
      <ul className="flex flex-wrap gap-1.5">
        {ticket.tags.map((tag) => (
          <li
            key={tag}
            className={cx(
              "rounded-pill border px-2 py-px font-mono text-xs",
              tag.includes("chargeback")
                ? "border-transparent bg-danger-wash text-danger"
                : "border-rule text-ink-muted",
            )}
          >
            {tag}
          </li>
        ))}
      </ul>
      <p className="max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink">{ticket.body}</p>

      {view.field ? (
        <div>
          <p className="text-xs text-ink-muted">{view.field.label}</p>
          <p className="mt-1 min-h-10 rounded-control border border-rule-strong bg-canvas px-3 py-2 text-sm text-ink">
            {view.field.value}
            {view.field.typing ? (
              <span
                aria-hidden="true"
                className="ml-px inline-block h-4 w-px translate-y-0.5 bg-ink"
              />
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-t border-rule pt-3">
        {ACTIONS.map((o) => {
          const pressed = view.pressed === o;
          const done = committed === o;
          const blocked = view.phase === "blocked" && o === "refund";
          return (
            <span
              key={o}
              className={cx(
                "inline-flex min-h-8 items-center rounded-control border px-2.5 text-[0.8125rem]",
                pressed || done
                  ? "border-ink bg-ink text-canvas"
                  : blocked
                    ? "border-guard text-ink"
                    : "border-rule-strong text-ink-muted",
                committed && !done && "opacity-45",
              )}
            >
              {ACTION_LABELS[o]}
            </span>
          );
        })}
      </div>

      <DeskStatus view={view} committed={committed} />
    </article>
  );
}

function DeskStatus({ view, committed }: { view: DeskView; committed: Outcome | undefined }) {
  if (view.phase === "blocked") {
    return (
      <p
        role="status"
        className="relative overflow-hidden rounded-control bg-guard-wash py-2.5 pr-3 pl-4 text-[0.9375rem] text-ink"
      >
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-guard" />
        <span className="font-medium">Paused by Shadow</span>
        <span className="text-ink-muted">
          {" "}
          before it was saved
          {view.blockedRuleIds.length > 0 ? ` (rule ${view.blockedRuleIds.join(", ")})` : ""}
        </span>
      </p>
    );
  }
  if (view.phase === "checking") {
    return <p className="min-h-6 text-sm text-ink-muted">Checking…</p>;
  }
  if (committed) {
    return (
      <p className="inline-flex min-h-6 items-center gap-1.5 text-sm text-ok">
        <Check aria-hidden="true" className="size-4" />
        Saved: {ACTION_LABELS[committed]}
      </p>
    );
  }
  return <p className="min-h-6 text-sm text-ink-faint">Nothing saved yet</p>;
}
