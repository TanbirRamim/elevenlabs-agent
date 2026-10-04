import type { PublicTicket } from "@shadow/schema";
import { PII_ATTR } from "./types";

const pii = { [PII_ATTR]: "" };

export function TagList({ tags }: { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li
          key={tag}
          className={
            tag.toLowerCase().includes("chargeback")
              ? "rounded bg-red-700 px-2 py-0.5 text-base font-bold text-white"
              : "rounded bg-neutral-200 px-2 py-0.5 text-base font-medium text-neutral-800"
          }
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function TicketDetail({ ticket }: { ticket: PublicTicket }) {
  const c = ticket.customer;
  return (
    <article className="flex flex-col gap-3">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">
          <span className="mr-2 font-mono text-xl text-neutral-500">{ticket.id}</span>
          {ticket.subject}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg">
          <span {...pii} className="font-semibold">
            {c.name}
          </span>
          <span {...pii} className="text-neutral-600">
            {c.email}
          </span>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-sm font-bold uppercase text-white">
            {c.plan}
          </span>
          {c.vip ? (
            <span className="rounded bg-amber-400 px-2 py-0.5 text-sm font-bold text-amber-950">
              VIP
            </span>
          ) : null}
          <span className="text-neutral-600">Account: {c.accountAgeDays} days</span>
        </div>
      </header>

      <div className="flex flex-wrap gap-x-8 gap-y-1 text-lg">
        {ticket.amountEur !== undefined ? (
          <p>
            <span className="font-semibold">Amount:</span> €{ticket.amountEur.toFixed(2)}
          </p>
        ) : null}
        {ticket.knownBugId !== undefined ? (
          <p>
            <span className="font-semibold">Known bug:</span>{" "}
            <span className="font-mono">{ticket.knownBugId}</span>
          </p>
        ) : null}
      </div>

      <TagList tags={ticket.tags} />

      <p className="whitespace-pre-wrap text-lg leading-relaxed">{ticket.body}</p>
    </article>
  );
}
