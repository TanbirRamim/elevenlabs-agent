import type { PublicTicket } from "@shadow/schema";
import { Bug, Crown, Mail, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, cx } from "../ui";
import { PII_ATTR } from "./types";

const pii = { [PII_ATTR]: "" };

/** Tags that change what an agent may do. They take the danger tone so they read before anything else. */
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

export function TagList({ tags, className }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className={cx("flex flex-wrap gap-1", className)}>
      {tags.map((tag) => {
        const risk = isRiskTag(tag);
        return (
          <li key={tag}>
            <Badge tone={risk ? "danger" : "muted"} dot={risk}>
              {tag}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-2xs text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ui text-ink">{children}</dd>
    </div>
  );
}

/**
 * One ticket, laid out like a support workspace: subject and tags, the customer's message as a
 * thread, and a customer sidebar on wide containers (stacked above the thread when narrow).
 * Name and email are the only personal data and carry `data-pii`, once each.
 */
export function TicketDetail({ ticket }: { ticket: PublicTicket }) {
  const c = ticket.customer;
  return (
    <article className="grid min-w-0 @5xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-4 px-4 py-4 @3xl:px-6 @3xl:py-5">
        <header className="flex flex-col gap-2">
          <h2 className="flex flex-wrap items-baseline gap-x-2 text-base leading-6 font-semibold text-balance text-ink">
            <span className="font-mono text-ui font-normal text-ink-faint">{ticket.id}</span>
            {ticket.subject}
          </h2>
          <TagList tags={ticket.tags} />
        </header>

        <section aria-label="Message" className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-selected text-ink-muted"
          >
            <UserRound className="size-4 stroke-[1.75]" />
          </span>
          <div className="min-w-0 flex-1 rounded-panel border border-rule bg-surface">
            <p className="flex items-center gap-2 border-b border-rule px-3.5 py-2 text-xs text-ink-muted">
              <Mail aria-hidden="true" className="size-3.5 stroke-[1.75]" />
              Message from the customer
            </p>
            <p className="max-w-[68ch] px-3.5 py-3 text-base leading-relaxed whitespace-pre-wrap text-ink">
              {ticket.body}
            </p>
          </div>
        </section>
      </div>

      <aside
        aria-label="Customer"
        className="order-first border-b border-rule bg-canvas/60 px-4 py-3 @3xl:px-6 @5xl:order-none @5xl:border-b-0 @5xl:border-l @5xl:px-4 @5xl:py-5"
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 @5xl:flex-col @5xl:items-stretch @5xl:gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-selected text-ink-muted"
            >
              <UserRound className="size-4 stroke-[1.75]" />
            </span>
            <div className="min-w-0">
              <p {...pii} className="truncate text-ui font-semibold text-ink">
                {c.name}
              </p>
              <p {...pii} className="truncate text-xs text-ink-muted">
                {c.email}
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 @5xl:flex-col @5xl:gap-3">
            <Row label="Plan">
              <span className="inline-flex items-center gap-1.5">
                {PLAN_LABELS[c.plan]}
                {c.vip ? (
                  <Badge tone="neutral" icon={<Crown aria-hidden="true" />}>
                    VIP
                  </Badge>
                ) : null}
              </span>
            </Row>
            <Row label="Account age">
              <span className="figures">{c.accountAgeDays} days</span>
            </Row>
            <Row label="Amount">
              {ticket.amountEur !== undefined ? (
                <span className="figures font-semibold">{formatEur(ticket.amountEur)}</span>
              ) : (
                <span className="text-ink-muted">No amount on this ticket</span>
              )}
            </Row>
            {ticket.knownBugId !== undefined ? (
              <Row label="Known bug">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                  <Bug aria-hidden="true" className="size-3.5 stroke-[1.75] text-ink-muted" />
                  {ticket.knownBugId}
                </span>
              </Row>
            ) : null}
          </dl>
        </div>
      </aside>
    </article>
  );
}
