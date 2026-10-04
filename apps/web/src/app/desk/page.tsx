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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">DeskSim preview</h1>
      <p className="mt-1 text-neutral-500">
        Standalone preview of the sandbox helpdesk. In sessions it is embedded by /capture and
        /teach.
      </p>

      <div className="mt-6">
        {state.kind === "loading" ? <p className="text-lg">Loading tickets…</p> : null}
        {state.kind === "error" ? (
          <p className="rounded border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
            API unreachable at {publicEnv.apiUrl} ({state.message}). Run <code>pnpm dev</code> and
            reload.
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

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Event log ({events.length})</h2>
        <ul className="mt-2 flex max-h-96 flex-col gap-1 overflow-y-auto font-mono text-sm">
          {events.map(({ seq, event }) => (
            <li key={seq} className="rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
              <span className="font-bold">{event.type}</span> · {event.tMs} ms ·{" "}
              {JSON.stringify(event)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
