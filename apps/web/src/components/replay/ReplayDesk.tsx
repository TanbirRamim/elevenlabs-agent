import type { Outcome, PublicTicket } from "@shadow/schema";
import { Check, Inbox, ShieldAlert } from "lucide-react";
import { ACTION_LABELS } from "../desk/ActionBar";
import { Badge } from "../ui/Badge";
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
  const open = view.tickets.filter((t) => !view.committed[t.id]).length;
  return (
    <section
      aria-label={`DeskSim, ${queueLabel}`}
      className="overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <header className="flex h-11 items-center justify-between gap-3 border-b border-rule px-4">
        <span className="flex min-w-0 items-center gap-2">
          <Inbox aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-ink-muted" />
          <span className="truncate text-ui font-semibold text-ink">{queueLabel}</span>
          <span className="figures text-xs text-ink-faint">{open} open</span>
        </span>
        <Badge tone="muted">Sandbox helpdesk</Badge>
      </header>
      <div className="grid md:grid-cols-[13rem_1fr]">
        <ol
          aria-label="Ticket queue"
          className="grid grid-cols-2 gap-px border-b border-rule bg-rule md:flex md:flex-col md:gap-0 md:border-r md:border-b-0 md:bg-sunken md:p-1.5"
        >
          {view.tickets.map((t) => {
            const done = view.committed[t.id];
            const current = t.id === view.selectedId;
            return (
              <li
                key={t.id}
                aria-current={current ? "true" : undefined}
                className={cx(
                  "flex min-w-0 flex-col gap-0.5 px-3 py-2 md:rounded-control",
                  current ? "bg-selected" : "bg-surface md:bg-transparent",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="figures font-mono text-2xs text-ink-faint">{t.id}</span>
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-2xs font-medium text-ok">
                      <Check aria-hidden="true" className="size-3" />
                      <span className="max-sm:sr-only">{ACTION_LABELS[done]}</span>
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "truncate text-ui",
                    current ? "font-medium text-ink" : "text-ink-muted",
                  )}
                >
                  {t.subject}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 p-4">
          {selected ? (
            <TicketBody ticket={selected} view={view} />
          ) : (
            <p className="py-10 text-ui text-ink-faint">The queue is open.</p>
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
        <h3 className="flex items-baseline gap-2 text-sm font-semibold text-ink">
          <span className="figures font-mono text-xs font-normal text-ink-faint">{ticket.id}</span>
          {ticket.subject}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
          <span className="text-ink">{c.name}</span>
          <span aria-hidden="true" className="text-ink-faint">
            ·
          </span>
          <span>{c.plan.charAt(0).toUpperCase() + c.plan.slice(1)} plan</span>
          <span aria-hidden="true" className="text-ink-faint">
            ·
          </span>
          <span className="figures">{c.accountAgeDays} days</span>
          {ticket.amountEur !== undefined ? (
            <>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <span className="figures font-mono text-ink">€{ticket.amountEur.toFixed(2)}</span>
            </>
          ) : null}
        </p>
      </header>
      <ul aria-label="Tags" className="flex flex-wrap gap-1">
        {ticket.tags.map((tag) => (
          <li key={tag}>
            <Badge tone={tag.includes("chargeback") ? "guard" : "muted"} className="font-mono">
              {tag}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="max-w-[60ch] rounded-panel border border-rule bg-sunken px-3 py-2.5 text-ui text-ink">
        {ticket.body}
      </p>

      {view.field ? (
        <div>
          <p className="text-xs font-medium text-ink-muted">{view.field.label}</p>
          <p className="mt-1 min-h-8 rounded-control border border-rule-strong bg-surface px-2.5 py-1.5 text-ui text-ink">
            {view.field.value}
            {view.field.typing ? (
              <span
                aria-hidden="true"
                className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-ink"
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
                "inline-flex h-7 items-center rounded-control border px-2.5 text-xs font-medium",
                pressed || done
                  ? "border-ink bg-ink text-ink-inverse"
                  : blocked
                    ? "border-guard bg-guard-wash text-guard-text"
                    : "border-rule-strong bg-surface text-ink-muted shadow-raised",
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
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-guard/30 bg-guard-wash px-3 py-2 text-ui text-ink"
      >
        <ShieldAlert aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-guard-text" />
        <span className="font-medium">Paused by Shadow</span>
        <span className="text-ink-muted">
          before it was saved
          {view.blockedRuleIds.length > 0 ? ` (rule ${view.blockedRuleIds.join(", ")})` : ""}
        </span>
      </p>
    );
  }
  if (view.phase === "checking") {
    return <p className="min-h-6 text-xs text-ink-muted">Checking against the Work Map…</p>;
  }
  if (committed) {
    return (
      <p className="inline-flex min-h-6 items-center gap-1.5 text-xs font-medium text-ok">
        <Check aria-hidden="true" className="size-3.5" />
        Saved: {ACTION_LABELS[committed]}
      </p>
    );
  }
  return <p className="min-h-6 text-xs text-ink-faint">Nothing saved yet</p>;
}
