import type { GuardVerdict, Outcome } from "@shadow/schema";
import type { ReactNode } from "react";
import { ActionBar, type CommitPhase, type CommittedAction } from "../desk/ActionBar";
import { TicketDetail } from "../desk/TicketDetail";
import { TicketQueue } from "../desk/TicketQueue";
import { cx } from "../ui/cx";
import type { DeskView } from "./script";

/**
 * A still of the standalone DeskSim app at one moment of the replay. It is built from DeskSim's
 * own pieces (TicketQueue, TicketDetail, ActionBar) in DeskSim's `chrome="app"` frame, driven by
 * the script instead of by clicks so any moment can be shown directly when the viewer scrubs.
 * Shadow's floating dock (CapturePill or TeachDock, passed as `dock`) sits over the bottom of
 * the app the way it does live: the frame's transform makes it the containing block for the
 * dock's `position: fixed`. Nothing in it is interactive (`inert`), because it is a recording.
 */
/**
 * Story mode: the one panel that matters right now keeps full strength and an outline; the rest
 * steps back, so a viewer knows where to look within the first seconds of each act.
 */
export function focusClass(on: boolean): string {
  return cx(
    "rounded-panel transition-[opacity,box-shadow] duration-200 motion-reduce:transition-none",
    on ? "ring-2 ring-ask ring-offset-2 ring-offset-canvas" : "opacity-55",
  );
}

export function ReplayDesk({
  view,
  attempt,
  coach,
  dock,
  className,
}: {
  view: DeskView;
  /** The action the guard checked or paused, with its verdict (Teach). */
  attempt?: { outcome: Outcome; verdict: GuardVerdict };
  /** Coaching anchored under the action bar, as /teach renders it. */
  coach?: ReactNode;
  dock?: ReactNode;
  className?: string;
}) {
  const selected = view.tickets.find((t) => t.id === view.selectedId) ?? null;
  const committed: Record<string, CommittedAction> = Object.fromEntries(
    Object.entries(view.committed).map(([id, outcome]) => [
      id,
      { outcome, approvalRequested: false },
    ]),
  );
  const doneCount = Object.keys(committed).length;
  const current = selected ? committed[selected.id] : undefined;
  let phase: CommitPhase = { kind: "idle" };
  if (view.phase === "blocked" && attempt) phase = { kind: "blocked", ...attempt };
  else if (view.phase === "checking" && attempt)
    phase = { kind: "checking", outcome: attempt.outcome };
  else if (current)
    phase = { kind: "committed", outcome: current.outcome, approvalRequested: false };
  const noop = () => {};

  return (
    <div
      className={cx(
        "relative isolate overflow-hidden rounded-panel border border-rule bg-surface [transform:translateZ(0)]",
        className,
      )}
    >
      <section
        aria-label="DeskSim, the support app"
        inert
        className={cx(
          "@container flex h-full min-h-0 flex-col bg-surface text-ui text-ink",
          dock ? "pb-36 sm:pb-[4.75rem]" : null,
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-rule px-3 @3xl:px-4">
          <p className="flex min-w-0 items-center gap-2 font-semibold">
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-[5px] bg-ink text-[11px] font-bold text-ink-inverse"
            >
              D
            </span>
            DeskSim
            <span className="text-xs font-normal text-ink-faint">Inbox</span>
            <span className="figures text-xs font-normal text-ink-faint">
              {view.tickets.length - doneCount} open
              {doneCount > 0 ? ` · ${doneCount} done` : ""}
            </span>
          </p>
        </div>
        <div className="grid min-h-0 flex-1 @2xl:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="border-b border-rule bg-canvas @2xl:min-h-0 @2xl:overflow-hidden @2xl:border-r @2xl:border-b-0">
            <TicketQueue
              tickets={view.tickets}
              selectedId={view.selectedId}
              committed={committed}
              heldId={view.phase === "blocked" ? view.selectedId : null}
              onSelect={noop}
            />
          </div>
          {selected ? (
            <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              <TicketDetail ticket={selected} committed={current} />
              <ActionBar
                phase={phase}
                committed={current}
                refundAmount=""
                onRefundAmountChange={noop}
                onRefundFocus={noop}
                onRefundBlur={noop}
                replyDraft={view.field?.value ?? ""}
                onReplyDraftChange={noop}
                onReplyFocus={noop}
                onReplyBlur={noop}
                onAction={noop}
                coach={coach}
              />
            </div>
          ) : (
            <div className="flex min-h-40 flex-col items-start justify-center gap-1 px-6 py-8">
              <p className="text-sm font-medium text-ink">No ticket open</p>
              <p className="text-ui text-ink-muted">The queue is open.</p>
            </div>
          )}
        </div>
      </section>
      {dock ? <div inert>{dock}</div> : null}
    </div>
  );
}
