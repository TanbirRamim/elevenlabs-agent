"use client";

import type { Outcome, PublicTicket } from "@shadow/schema";
import { useRef, useState } from "react";
import { ActionBar, type CommitPhase, type CommittedAction } from "./ActionBar";
import { TicketDetail } from "./TicketDetail";
import { TicketQueue } from "./TicketQueue";
import { DESK_ROOT_ID, type DeskSimProps } from "./types";

export function DeskSim({ tickets, mode, clock, onDeskEvent, preSave }: DeskSimProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<CommitPhase>({ kind: "idle" });
  const [committed, setCommitted] = useState<Record<string, CommittedAction>>({});
  const [refundAmount, setRefundAmount] = useState("");
  // Monotonic token: a preSave result only applies if no newer commit/selection happened.
  const requestSeq = useRef(0);
  const lastActivityAt = useRef(Number.NEGATIVE_INFINITY);
  const refundFrom = useRef<string | null>(null);

  const selected = tickets.find((t) => t.id === selectedId);

  function markActivity() {
    const now = clock();
    if (now - lastActivityAt.current < 500) return;
    lastActivityAt.current = now;
    onDeskEvent({ type: "input_activity", tMs: now });
  }

  function selectTicket(id: string) {
    if (id === selectedId) return;
    requestSeq.current += 1;
    setSelectedId(id);
    setPhase({ kind: "idle" });
    const ticket = tickets.find((t) => t.id === id);
    const amount = ticket?.amountEur !== undefined ? String(ticket.amountEur) : "";
    setRefundAmount(amount);
    refundFrom.current = amount || null;
    onDeskEvent({ type: "ticket_opened", tMs: clock(), ticketId: id });
  }

  function handleRefundFocus() {
    refundFrom.current = refundAmount || null;
  }

  function handleRefundBlur() {
    if (!selected) return;
    const to = refundAmount || null;
    if (to === refundFrom.current) return;
    onDeskEvent({
      type: "field_changed",
      tMs: clock(),
      ticketId: selected.id,
      field: "refund_amount",
      from: refundFrom.current,
      to,
    });
    refundFrom.current = to;
  }

  async function commitAction(ticket: PublicTicket, outcome: Outcome) {
    const seq = ++requestSeq.current;
    const parsed = Number(refundAmount);
    const amountEur =
      outcome === "refund" && refundAmount !== "" && Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : undefined;
    setPhase({ kind: "checking", outcome });
    let verdict: Awaited<ReturnType<typeof preSave>>;
    try {
      verdict = await preSave({
        ticket,
        outcome,
        ...(amountEur !== undefined ? { amountEur } : {}),
      });
    } catch {
      if (seq === requestSeq.current) setPhase({ kind: "idle" });
      return;
    }
    if (seq !== requestSeq.current) return;
    if (verdict.decision === "BLOCK") {
      setPhase({ kind: "blocked", outcome, verdict });
      return;
    }
    onDeskEvent({
      type: "action_committed",
      tMs: clock(),
      ticketId: ticket.id,
      outcome,
      ...(amountEur !== undefined ? { amountEur } : {}),
    });
    const approvalRequested = verdict.decision === "REQUIRE_APPROVAL";
    setPhase({ kind: "committed", outcome, approvalRequested });
    setCommitted((m) => ({ ...m, [ticket.id]: { outcome, approvalRequested } }));
  }

  return (
    <section
      id={DESK_ROOT_ID}
      onClickCapture={markActivity}
      onKeyDownCapture={markActivity}
      className="@container overflow-hidden rounded-panel border border-rule-strong bg-surface text-ink"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3 sm:px-5">
        <p className="text-[1.0625rem] font-semibold">Support inbox</p>
        <p className="font-mono text-sm text-ink-faint">
          {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
        </p>
      </div>
      <div className="grid @3xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
        <div className="border-b border-rule bg-sunken @3xl:border-r @3xl:border-b-0">
          <TicketQueue
            tickets={tickets}
            selectedId={selectedId}
            committed={committed}
            onSelect={selectTicket}
          />
        </div>
        {selected ? (
          <div className="flex min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 @3xl:px-8 @3xl:py-7">
            <TicketDetail ticket={selected} />
            <ActionBar
              phase={phase}
              committed={committed[selected.id]}
              refundAmount={refundAmount}
              onRefundAmountChange={setRefundAmount}
              onRefundFocus={handleRefundFocus}
              onRefundBlur={handleRefundBlur}
              onAction={(outcome) => void commitAction(selected, outcome)}
            />
          </div>
        ) : (
          <div className="flex min-h-64 flex-col justify-center gap-2 px-6 py-10 @3xl:px-10">
            <p className="text-base leading-tight text-ink">No ticket open</p>
            <p className="text-lg text-ink-muted">Select a ticket to begin ({mode} mode).</p>
          </div>
        )}
      </div>
    </section>
  );
}
