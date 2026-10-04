"use client";

import { type DeskEvent, type GuardVerdict, TicketsResponse } from "@shadow/schema";
import { useEffect, useRef, useState } from "react";
import { DeskSim } from "@/components/desk/DeskSim";
import { publicEnv } from "@/env";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; tickets: TicketsResponse["tickets"] };

const ALLOW: GuardVerdict = { decision: "ALLOW", ruleIds: [], source: "machine_rule" };

/**
 * Standalone preview for DeskSim (HAR-1). The real hosts are /capture and /teach;
 * here preSave always allows and every DeskEvent is logged on the page.
 */
export default function DeskPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [events, setEvents] = useState<{ seq: number; event: DeskEvent }[]>([]);
  const seqRef = useRef(0);
  const startRef = useRef<number | null>(null);
  if (startRef.current === null) startRef.current = performance.now();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${publicEnv.apiUrl}/tickets?set=expert`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { tickets } = TicketsResponse.parse(await res.json());
        setState({ kind: "ready", tickets });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => controller.abort();
  }, []);

  const clock = () => Math.max(0, Math.round(performance.now() - (startRef.current ?? 0)));
  const onDeskEvent = (event: DeskEvent) =>
    setEvents((prev) => [{ seq: ++seqRef.current, event }, ...prev].slice(0, 100));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-[2.25rem] leading-[1.1] font-normal tracking-[-0.015em] text-ink sm:text-[2.75rem]">
        DeskSim preview
      </h1>
      <p className="mt-3 max-w-[34rem] text-[1.0625rem] leading-relaxed text-ink-muted">
        The sandbox helpdesk on its own. In a session, Capture and Teach embed it; here every action
        is allowed and every desk event is listed below.
      </p>

      <div className="mt-8">
        {state.kind === "loading" ? (
          <p className="text-lg text-ink-muted">Loading tickets…</p>
        ) : null}
        {state.kind === "error" ? (
          <p className="rounded-panel border border-stop/40 bg-stop-wash px-5 py-4 text-lg text-ink">
            <span className="font-semibold text-stop">API unreachable</span> at{" "}
            <span className="font-mono text-base">{publicEnv.apiUrl}</span> ({state.message}). Run{" "}
            <code className="font-mono text-base">pnpm dev</code> and reload.
          </p>
        ) : null}
        {state.kind === "ready" ? (
          <DeskSim
            tickets={state.tickets}
            mode="capture"
            clock={clock}
            onDeskEvent={onDeskEvent}
            preSave={async () => ALLOW}
          />
        ) : null}
      </div>

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="event-log">
        <h2 id="event-log" className="font-display text-[1.75rem] leading-tight text-ink">
          Event log <span className="font-mono text-base text-ink-faint">{events.length}</span>
        </h2>
        {events.length === 0 ? (
          <p className="mt-3 text-ink-muted">Open a ticket to see events here.</p>
        ) : (
          <ol className="mt-4 flex max-h-96 flex-col divide-y divide-rule overflow-y-auto rounded-panel border border-rule bg-surface font-mono text-sm">
            {events.map(({ seq, event }) => (
              <li
                key={seq}
                className="grid gap-x-4 gap-y-1 px-4 py-2 sm:grid-cols-[6rem_9rem_minmax(0,1fr)]"
              >
                <span className="text-ink-faint tabular-nums">{event.tMs} ms</span>
                <span className="font-semibold text-ink">{event.type}</span>
                <span className="break-all text-ink-muted">{JSON.stringify(event)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
