"use client";

import type { CopilotTicketResult, Outcome } from "@shadow/schema";
import { useCallback, useEffect, useState } from "react";
import { publicEnv } from "../../env";
import { ApiClientError, api } from "../../lib/api";
import { Badge, Button, ButtonLink, buttonClasses, Stat, StatGroup } from "../ui";
import { type CopilotClient, type CopilotData, loadCopilot } from "./load";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  reply: "Reply",
  refund: "Refund",
  hold_request_info: "Hold, ask for info",
  escalate_tier2: "Escalate to Tier 2",
  escalate_engineering: "Escalate to Engineering",
  handoff_security: "Hand off to Security",
  handoff_legal: "Hand off to Legal",
  handoff_billing_disputes: "Hand off to Billing disputes",
  close: "Close",
};

const HANDOFF_LABEL: Record<NonNullable<CopilotTicketResult["handoffReason"]>, string> = {
  stop_and_ask: "stop-and-ask rule",
  judgment_call: "judgment call",
  approval_required: "needs a second approval",
  blocked: "a rule blocks the default",
};

export const FRAMING =
  "People first, then agents: the Work Map that taught the new hire, run as a policy.";

type State =
  | { status: "loading" }
  | { status: "ready"; data: CopilotData }
  | { status: "error"; error: Error };

export function CopilotView({
  mapId,
  apiUrl = publicEnv.apiUrl,
  client = api,
}: {
  mapId: string | null;
  /** Shown in the "API did not answer" message; the client is bound to it. */
  apiUrl?: string;
  client?: CopilotClient;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  const run = useCallback(() => {
    setState({ status: "loading" });
    loadCopilot(mapId, client).then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) =>
        setState({
          status: "error",
          error: error instanceof Error ? error : new Error("The Copilot run failed."),
        }),
    );
  }, [mapId, client]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <header className="max-w-[44rem]">
        <h1 className="font-display text-[2.75rem] leading-[1.05] font-normal tracking-[-0.025em] text-balance sm:text-[3.5rem]">
          Triage Copilot
        </h1>
        <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-pretty text-ink">{FRAMING}</p>
        <p className="mt-3 max-w-[34rem] text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
          It decides the ten held-out tickets the expert never worked, cites the rule it used, and
          hands blocks, approvals and judgment calls back to a person. Nothing is sent: this is
          shadow mode, scored against the expert’s own labels.
        </p>
      </header>

      <div aria-live="polite" className="mt-12 border-t border-rule pt-12">
        {state.status === "loading" ? (
          <p className="text-ink-muted">Running the Work Map over the held-out tickets…</p>
        ) : null}
        {state.status === "error" ? (
          <ErrorPanel error={state.error} apiUrl={apiUrl} mapId={mapId} onRetry={run} />
        ) : null}
        {state.status === "ready" ? <Results data={state.data} onRetry={run} /> : null}
      </div>
    </main>
  );
}

function ErrorPanel({
  error,
  apiUrl,
  mapId,
  onRetry,
}: {
  error: Error;
  apiUrl: string;
  mapId: string | null;
  onRetry: () => void;
}) {
  const kind =
    error instanceof ApiClientError
      ? error.kind === "http" && error.status === 404
        ? "no_map"
        : error.kind
      : "http";
  const message =
    kind === "network"
      ? `The API at ${apiUrl} did not answer. Start it with pnpm dev, then run the Copilot again.`
      : kind === "no_map"
        ? mapId
          ? `Work Map "${mapId}" was not found. Open the Work Map page and run the Copilot from a published map.`
          : "No Work Map is published yet. Publish one from the Map page, then run the Copilot again."
        : `The Copilot run failed: ${error.message}`;
  return (
    <div role="alert" className="max-w-[38rem]">
      <p className="text-[1.0625rem] leading-relaxed text-ink">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onRetry}>
          Run the Copilot again
        </Button>
        {kind === "no_map" ? (
          <ButtonLink href="/map/latest" variant="ghost">
            Open the Work Map
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

function percent(rate: number | null): string {
  return rate === null ? "n/a" : `${Math.round(rate * 100)}%`;
}

function Results({ data, onRetry }: { data: CopilotData; onRetry: () => void }) {
  const { run, exported } = data;
  const rulesJson = JSON.stringify(exported.rules, null, 2);
  return (
    <>
      <p className="max-w-[38rem] text-[1.0625rem] leading-relaxed text-ink-muted">
        {run.expertName}’s Work Map for {run.workflow.toLowerCase()},{" "}
        <span className="font-mono text-sm text-ink-faint">
          {run.workMapId} v{run.version}
        </span>
      </p>

      <StatGroup className="mt-10">
        <Stat
          value={percent(run.agreement.rate)}
          label={`agreement with ${run.expertName}’s decisions`}
          note={`${run.agreement.agreed} of ${run.agreement.total} held-out tickets`}
        />
        <Stat
          value={run.handedToHuman}
          label="handed to a human"
          note="blocks, approvals, judgment calls"
        />
        <Stat
          value={exported.rules.machine.length}
          label="machine rules in the policy"
          note={`${exported.rules.guardrails.length} guardrails exported`}
        />
      </StatGroup>

      <section aria-labelledby="copilot-results" className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[40rem]">
            <h2
              id="copilot-results"
              className="font-display text-[2rem] leading-[1.1] font-normal tracking-[-0.015em] text-ink"
            >
              Ticket by ticket
            </h2>
            <p className="mt-3 leading-relaxed text-pretty text-ink-muted">
              The Copilot starts from the default action, a refund when the ticket names an amount
              and a reply otherwise, and the Work Map’s rules overrule it.{" "}
              {run.judge === "on"
                ? "Each action also went to the language-model judge, the same check a pre-save gets."
                : "Machine rules only: no language-model key is configured, so the judge did not run."}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Run again
          </Button>
        </div>
        <ResultsTable rows={run.tickets} expertName={run.expertName} />
      </section>

      <section aria-labelledby="copilot-export" className="mt-16 border-t border-rule pt-12">
        <h2
          id="copilot-export"
          className="font-display text-[2rem] leading-[1.1] font-normal tracking-[-0.015em] text-ink"
        >
          The exported policy
        </h2>
        <p className="mt-3 max-w-[40rem] leading-relaxed text-pretty text-ink-muted">
          The same map as an agent’s system prompt and rule file: steps in order, guardrails as hard
          rules, and when to stop and hand over.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            className={buttonClasses({ variant: "secondary" })}
            href={`data:application/json;charset=utf-8,${encodeURIComponent(rulesJson)}`}
            download={`${run.workMapId}-rules.json`}
          >
            Download rules.json
          </a>
        </div>
        <details className="group mt-6 rounded-panel border border-rule bg-surface">
          <summary className="cursor-pointer list-none px-5 py-4 text-[0.9375rem] font-medium text-ink">
            <span className="group-open:hidden">Show the system prompt</span>
            <span className="hidden group-open:inline">Hide the system prompt</span>
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-rule px-5 py-4 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-ink-muted">
            {exported.systemPrompt}
          </pre>
        </details>
      </section>
    </>
  );
}

const CELL = "block py-1 md:table-cell md:py-4 md:pr-6 md:align-top";
const CELL_LABEL = "mb-0.5 block text-[0.8125rem] text-ink-faint md:hidden";

function ResultsTable({ rows, expertName }: { rows: CopilotTicketResult[]; expertName: string }) {
  return (
    <table className="mt-8 block w-full text-left text-[0.9375rem] md:table">
      <caption className="sr-only">
        Copilot decisions on the held-out tickets, compared with {expertName}’s labels
      </caption>
      <thead className="hidden border-b border-rule-strong md:table-header-group">
        <tr className="text-[0.8125rem] text-ink-muted">
          <th scope="col" className="py-3 pr-6 font-medium">
            Ticket
          </th>
          <th scope="col" className="py-3 pr-6 font-medium">
            Copilot decision
          </th>
          <th scope="col" className="py-3 pr-6 font-medium">
            Cited rule
          </th>
          <th scope="col" className="py-3 pr-6 font-medium">
            {expertName}’s label
          </th>
          <th scope="col" className="py-3 pr-6 font-medium">
            Agreement
          </th>
          <th scope="col" className="py-3 font-medium">
            Handed to a human
          </th>
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {rows.map((r) => (
          <tr
            key={r.ticketId}
            data-ticket-id={r.ticketId}
            className="block border-b border-rule py-4 md:table-row md:py-0"
          >
            <th scope="row" className={`${CELL} font-normal`}>
              <span className="font-mono text-[0.8125rem] text-ink-faint">{r.ticketId}</span>
              <span className="mt-0.5 block text-ink">{r.subject}</span>
            </th>
            <td className={CELL}>
              <span className={CELL_LABEL}>Copilot decision</span>
              <span className="text-ink">
                {r.decision ? OUTCOME_LABEL[r.decision] : "No action, rule blocks it"}
              </span>
              {r.decision !== r.proposed ? (
                <span className="mt-0.5 block text-[0.8125rem] text-ink-faint">
                  instead of {OUTCOME_LABEL[r.proposed].toLowerCase()}
                </span>
              ) : null}
            </td>
            <td className={CELL}>
              <span className={CELL_LABEL}>Cited rule</span>
              {r.citedGuardrailIds.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {r.citedGuardrailIds.map((id) => (
                    <Badge key={id} tone="signal" className="font-mono">
                      {id}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="text-ink-faint">None applies</span>
              )}
            </td>
            <td className={CELL}>
              <span className={CELL_LABEL}>{expertName}’s label</span>
              <span className="text-ink">{OUTCOME_LABEL[r.expected]}</span>
              {r.expectedGuardrailIds.length > 0 ? (
                <span className="mt-0.5 block font-mono text-[0.8125rem] text-ink-faint">
                  {r.expectedGuardrailIds.join(", ")}
                </span>
              ) : null}
            </td>
            <td className={CELL}>
              <span className={CELL_LABEL}>Agreement</span>
              <Badge tone={r.agrees ? "ok" : "stop"} dot>
                {r.agrees ? "Agrees" : "Differs"}
              </Badge>
            </td>
            <td className={`${CELL} md:pr-0`}>
              <span className={CELL_LABEL}>Handed to a human</span>
              {r.handoffReason ? (
                <span className="text-ink">
                  Yes, <span className="text-ink-muted">{HANDOFF_LABEL[r.handoffReason]}</span>
                </span>
              ) : (
                <span className="text-ink-muted">No, Copilot decides</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
