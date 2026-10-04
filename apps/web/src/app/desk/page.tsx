"use client";

import { type DeskEvent, type GuardVerdict, TicketsResponse } from "@shadow/schema";
import { GraduationCap, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DeskSim } from "@/components/desk/DeskSim";
import { Page } from "@/components/shell/Page";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
} from "@/components/ui";
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
    <Page width="wide">
      <PageHeader
        title="Desk preview"
        description="The sandbox helpdesk on its own. Capture and Teach embed it in a session; here every action is allowed and every desk event is logged below."
        meta={<Badge tone="muted">Tool</Badge>}
        actions={
          <ButtonLink
            href="/teach"
            variant="secondary"
            size="sm"
            icon={<GraduationCap aria-hidden="true" />}
          >
            Open in Teach
          </ButtonLink>
        }
      />

      <div className="mt-6">
        {state.kind === "loading" ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3">
            <span className="sr-only">Loading tickets</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : null}
        {state.kind === "error" ? (
          <Alert tone="offline" title="The API is unreachable">
            Tried <span className="font-mono text-xs">{publicEnv.apiUrl}</span> ({state.message}).
            Run <code className="font-mono text-xs">pnpm dev</code> and reload.
          </Alert>
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

      <Panel
        id="event-log"
        className="mt-8"
        title="Event log"
        meta={`${events.length} events`}
        actions={
          events.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw aria-hidden="true" />}
              onClick={() => setEvents([])}
            >
              Clear
            </Button>
          ) : null
        }
        flush
      >
        {events.length === 0 ? (
          <div className="px-4">
            <EmptyState
              title="No events yet"
              description="Open a ticket to see desk events here."
            />
          </div>
        ) : (
          <ol className="flex max-h-96 flex-col divide-y divide-rule overflow-y-auto font-mono text-xs">
            {events.map(({ seq, event }) => (
              <li
                key={seq}
                className="grid gap-x-4 gap-y-1 px-4 py-2 sm:grid-cols-[6rem_9rem_minmax(0,1fr)]"
              >
                <span className="figures text-ink-faint">{event.tMs} ms</span>
                <span className="font-medium text-ink">{event.type}</span>
                <span className="break-all text-ink-muted">{JSON.stringify(event)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </Page>
  );
}
