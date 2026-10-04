"use client";

import type { Outcome, PublicTicket } from "@shadow/schema";
import { Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SingodaNav } from "@/app/capture/parts";
import { cx, Kbd } from "../ui";
import { ACTION_ORDER, ActionBar, type CommitPhase, type CommittedAction } from "./ActionBar";
import { useDeskCoach } from "./coach";
import { TicketDetail } from "./TicketDetail";
import { queueItemId, TicketQueue } from "./TicketQueue";
import { DESK_ROOT_ID, type DeskSimProps } from "./types";

export function DeskSim({
  tickets,
  mode,
  clock,
  onDeskEvent,
  preSave,
  chrome = "card",
}: DeskSimProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<CommitPhase>({ kind: "idle" });
  const [committed, setCommitted] = useState<Record<string, CommittedAction>>({});
  const [refundAmount, setRefundAmount] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  // Monotonic token: a preSave result only applies if no newer commit/selection happened.
  const requestSeq = useRef(0);
  const lastActivityAt = useRef(Number.NEGATIVE_INFINITY);
  const refundFrom = useRef<string | null>(null);
  const replyFrom = useRef<string | null>(null);

  const selected = tickets.find((t) => t.id === selectedId);
  const coach = useDeskCoach();
  const busy =
    phase.kind === "checking" || (selected ? committed[selected.id] !== undefined : true);
  const doneCount = Object.keys(committed).length;

  // Keyboard: J / K move through the queue, 1-9 run the actions in the order the bar shows them.
  // Ignored while typing, with modifiers, or when a dialog is open (docs/DESIGN.md §10).
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      return;
    }
    if (document.querySelector("dialog[open]")) return;
    const key = e.key.toLowerCase();
    if ((key === "j" || key === "k") && tickets.length > 0) {
      const at = tickets.findIndex((t) => t.id === selectedId);
      const next =
        at === -1 ? 0 : Math.min(tickets.length - 1, Math.max(0, at + (key === "j" ? 1 : -1)));
      const ticket = tickets[next];
      if (!ticket) return;
      e.preventDefault();
      selectTicket(ticket.id);
      document.getElementById(queueItemId(ticket.id))?.focus();
      return;
    }
    const digit = Number(e.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= ACTION_ORDER.length && selected) {
      const outcome = ACTION_ORDER[digit - 1];
      if (!outcome || busy) return;
      e.preventDefault();
      void commitAction(selected, outcome);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey.current(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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
    setReplyDraft("");
    replyFrom.current = null;
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

  function handleReplyFocus() {
    replyFrom.current = replyDraft || null;
  }

  function handleReplyBlur() {
    if (!selected) return;
    const to = replyDraft || null;
    if (to === replyFrom.current) return;
    onDeskEvent({
      type: "field_changed",
      tMs: clock(),
      ticketId: selected.id,
      field: "reply_draft",
      from: replyFrom.current,
      to,
    });
    replyFrom.current = to;
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
    if (outcome === "reply") {
      setReplyDraft("");
      replyFrom.current = null;
    }
  }

  const app = chrome === "app";
  return (
    <section
      id={DESK_ROOT_ID}
      aria-label="Support inbox"
      onClickCapture={markActivity}
      onKeyDownCapture={markActivity}
      className={cx(
        "@container bg-surface text-ui text-ink",
        app ? "flex h-full min-h-0 flex-col" : "overflow-hidden rounded-panel border border-rule",
      )}
    >
      <div
        className={cx(
          "flex items-center justify-between gap-4 border-b border-rule px-3 @3xl:px-4",
          app ? "h-12 shrink-0" : "h-11",
        )}
      >
        <p className="flex min-w-0 items-center gap-2 font-semibold">
          {app ? (
            <>
              <span
                aria-hidden="true"
                className="inline-flex size-5 items-center justify-center rounded-[5px] bg-ink text-[11px] font-bold text-ink-inverse"
              >
                D
              </span>
              DeskSim
              <span className="text-xs font-normal text-ink-faint">Inbox</span>
            </>
          ) : (
            <>
              <Inbox aria-hidden="true" className="size-4 stroke-[1.75] text-ink-muted" />
              Support inbox
            </>
          )}
          <span className="figures text-xs font-normal text-ink-faint">
            {tickets.length - doneCount} open
            {doneCount > 0 ? ` · ${doneCount} done` : ""}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <p className="hidden items-center gap-3 text-xs text-ink-faint @2xl:flex">
            <span className="inline-flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> move
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>1</Kbd>–<Kbd>9</Kbd> act
            </span>
          </p>
          {/* The standalone app routes have no site chrome: this is the way back to Singoda AI. */}
          {app ? (
            <>
              <span aria-hidden="true" className="hidden h-5 w-px bg-rule @2xl:block" />
              <SingodaNav placement="down" align="end" />
            </>
          ) : null}
        </div>
      </div>
      <div
        className={cx(
          "grid @2xl:grid-cols-[15rem_minmax(0,1fr)] @5xl:grid-cols-[18rem_minmax(0,1fr)]",
          app && "min-h-0 flex-1",
        )}
      >
        <div
          className={cx(
            "border-b border-rule bg-canvas @2xl:border-r @2xl:border-b-0",
            app && "min-h-0 overflow-y-auto",
          )}
        >
          <TicketQueue
            tickets={tickets}
            selectedId={selectedId}
            committed={committed}
            heldId={phase.kind === "blocked" ? selectedId : null}
            onSelect={selectTicket}
          />
        </div>
        {selected ? (
          <div className={cx("flex min-w-0 flex-col", app && "min-h-0 overflow-y-auto")}>
            <TicketDetail ticket={selected} committed={committed[selected.id]} />
            <ActionBar
              phase={phase}
              committed={committed[selected.id]}
              refundAmount={refundAmount}
              onRefundAmountChange={setRefundAmount}
              onRefundFocus={handleRefundFocus}
              onRefundBlur={handleRefundBlur}
              replyDraft={replyDraft}
              onReplyDraftChange={setReplyDraft}
              onReplyFocus={handleReplyFocus}
              onReplyBlur={handleReplyBlur}
              onAction={(outcome) => void commitAction(selected, outcome)}
              coach={coach?.(selected.id, {
                busy,
                choose: (outcome) => {
                  if (!busy) void commitAction(selected, outcome);
                },
              })}
            />
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-start justify-center gap-1 px-6 py-8 @2xl:min-h-72 @3xl:px-10">
            <p className="text-sm font-medium text-ink">No ticket open</p>
            <p className="text-ui text-ink-muted">Select a ticket to begin ({mode} mode).</p>
            <p className="mt-2 hidden items-center gap-1 text-xs text-ink-faint @2xl:flex">
              Press <Kbd>J</Kbd> to open the first ticket.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
