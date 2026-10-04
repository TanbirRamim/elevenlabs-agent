import type { PublicTicket } from "@shadow/schema";
import { Badge, cx } from "../ui";
import { PII_ATTR } from "./types";

const pii = { [PII_ATTR]: "" };

/** Tags that change what an agent may do. They take the stop tone so they read before anything else. */
const RISK_TAG = /chargeback|dispute|fraud|security|legal|privacy/i;

export function isRiskTag(tag: string): boolean {
  return RISK_TAG.test(tag);
}

export const PLAN_LABELS = {
  free: "Free plan",
  monthly: "Monthly plan",
  annual: "Annual plan",
  enterprise: "Enterprise plan",
} satisfies Record<PublicTicket["customer"]["plan"], string>;

export function formatEur(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

export function TagList({ tags, size = "md" }: { tags: string[]; size?: "sm" | "md" }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const risk = isRiskTag(tag);
        return (
          <li key={tag}>
            <Badge
              tone={risk ? "stop" : "neutral"}
              dot={risk}
              className={cx(
                size === "md" ? "px-3! py-1! text-[0.9375rem]!" : "text-sm!",
                risk && "font-semibold",
              )}
            >
              {tag}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function TicketDetail({ ticket }: { ticket: PublicTicket }) {
  const c = ticket.customer;
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h2 className="font-display text-[1.75rem] leading-[1.15] font-normal tracking-[-0.01em] text-balance text-ink sm:text-[2rem]">
          <span className="mr-3 align-[0.2em] font-mono text-base tracking-normal text-ink-faint">
            {ticket.id}
          </span>
          {ticket.subject}
        </h2>
        <TagList tags={ticket.tags} />
      </header>

      <div className="grid gap-px overflow-hidden rounded-panel border border-rule bg-rule sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="Customer" className="flex flex-col gap-2 bg-sunken px-5 py-4">
          <p className="text-sm text-ink-muted">Customer</p>
          <p {...pii} className="text-xl leading-snug font-semibold break-words text-ink">
            {c.name}
          </p>
          <p {...pii} className="text-[1.0625rem] break-all text-ink-muted">
            {c.email}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="neutral" className="text-sm!">
              {PLAN_LABELS[c.plan]}
            </Badge>
            {c.vip ? (
              <Badge tone="neutral" className="border-ink! text-sm! font-semibold">
                VIP
              </Badge>
            ) : null}
            <span className="text-[0.9375rem] text-ink-muted">
              Account: {c.accountAgeDays} days
            </span>
          </div>
        </section>

        <dl className="flex flex-col justify-center gap-4 bg-sunken px-5 py-4">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-ink-muted">Amount</dt>
            {ticket.amountEur !== undefined ? (
              <dd className="font-display text-[2.5rem] leading-none tabular-nums text-ink">
                {formatEur(ticket.amountEur)}
              </dd>
            ) : (
              <dd className="text-lg text-ink-muted">No amount on this ticket</dd>
            )}
          </div>
          {ticket.knownBugId !== undefined ? (
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-ink-muted">Known bug</dt>
              <dd className="font-mono text-lg text-ink">{ticket.knownBugId}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <section aria-label="Message" className="flex flex-col gap-2">
        <p className="text-sm text-ink-muted">Message from the customer</p>
        <p className="max-w-[68ch] text-lg leading-relaxed whitespace-pre-wrap text-ink">
          {ticket.body}
        </p>
      </section>
    </article>
  );
}
