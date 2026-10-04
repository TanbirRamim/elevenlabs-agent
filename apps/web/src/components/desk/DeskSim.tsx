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
      className="grid grid-cols-[minmax(260px,320px)_1fr] gap-6 rounded-lg border-2 border-neutral-300 bg-white p-4 text-neutral-900"
    >
      <TicketQueue
        tickets={tickets}
        selectedId={selectedId}
        committed={committed}
        onSelect={selectTicket}
      />
      {selected ? (
        <div className="flex min-w-0 flex-col gap-4">
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
        <p className="self-center text-center text-lg text-neutral-600">
          Select a ticket to begin ({mode} mode).
        </p>
      )}
    </section>
  );
}
