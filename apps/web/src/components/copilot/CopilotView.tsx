"use client";

import type { CopilotTicketResult, Outcome } from "@shadow/schema";
import {
  Bot,
  Check,
  CircleDot,
  Copy,
  Download,
  GraduationCap,
  Map as MapIcon,
  RotateCw,
  Scale,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { publicEnv } from "../../env";
import { ApiClientError, api } from "../../lib/api";
import { Page } from "../shell/Page";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  buttonClasses,
  cx,
  EmptyState,
  Meter,
  PageHeader,
  Panel,
  SegmentedControl,
  Skeleton,
  Stat,
  StatGroup,
  StatusPill,
  Table,
  TBody,
  Td,
  THead,
  Th,
  Tr,
  useToast,
} from "../ui";
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
  no_rule_refund: "refund with no rule yet",
};

export const FRAMING =
  "People first, then agents: the Work Map that taught the new hire, run as a policy.";

const CAPTURE_HREF = "/capture?intent=start";

type State =
  | { status: "loading" }
  | { status: "ready"; data: CopilotData }
  | { status: "error"; error: Error };

type RowFilter = "all" | "differs" | "handoff";

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
  const [rerunning, setRerunning] = useState(false);

  const run = useCallback(
    (keep = false) => {
      if (keep) setRerunning(true);
      else setState({ status: "loading" });
      loadCopilot(mapId, client)
        .then(
          (data) => setState({ status: "ready", data }),
          (error: unknown) =>
            setState({
              status: "error",
              error: error instanceof Error ? error : new Error("The Copilot run failed."),
            }),
        )
        .finally(() => setRerunning(false));
    },
    [mapId, client],
  );

  useEffect(() => {
    run();
  }, [run]);

  const ready = state.status === "ready" ? state.data : null;
  const mapHref = mapId ? `/map/${encodeURIComponent(mapId)}` : "/map/latest";

  return (
    <Page width="wide">
      <PageHeader
        meta={
          <>
            <StatusPill tone="muted">Shadow mode, nothing is sent</StatusPill>
            {ready ? (
              ready.run.judge === "on" ? (
                <Badge tone="ok" icon={<Check aria-hidden="true" />}>
                  Judge on
                </Badge>
              ) : (
                <Badge tone="muted">Judge unavailable</Badge>
              )
            ) : null}
            {ready ? (
              <span className="text-xs text-ink-faint">
                <span className="font-mono">{ready.run.workMapId}</span> v{ready.run.version}
              </span>
            ) : null}
          </>
        }
        title="Triage Copilot"
        description={FRAMING}
        actions={
          <>
            <ButtonLink href={mapHref} variant="ghost" icon={<MapIcon aria-hidden="true" />}>
              Open the Work Map
            </ButtonLink>
            <Button
              variant="secondary"
              icon={<RotateCw aria-hidden="true" />}
              onClick={() => run(true)}
              loading={rerunning}
              disabled={state.status === "loading"}
            >
              Run again
            </Button>
          </>
        }
      />

      <div aria-live="polite" className="mt-6">
        {state.status === "loading" ? <LoadingResults /> : null}
        {state.status === "error" ? (
          <ErrorPanel error={state.error} apiUrl={apiUrl} mapId={mapId} onRetry={() => run()} />
        ) : null}
        {state.status === "ready" ? <Results data={state.data} /> : null}
      </div>
    </Page>
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

  if (kind === "no_map") {
    return (
      <div role="alert" className="rounded-panel border border-rule bg-surface">
        <EmptyState
          size="page"
          icon={<MapIcon />}
          title={mapId ? `Work Map "${mapId}" was not found` : "No Work Map is published yet"}
          description={
            mapId
              ? "Open the Work Map page and run the Copilot from a published map."
              : "The Copilot runs a published Work Map over tickets the expert never saw. Capture a session and publish its map, then run the Copilot again."
          }
          action={
            <>
              <ButtonLink href={CAPTURE_HREF} icon={<CircleDot aria-hidden="true" />}>
                Start a capture session
              </ButtonLink>
              <ButtonLink href="/map/latest?fixture=1" variant="secondary">
                Open the sample Work Map
              </ButtonLink>
            </>
          }
        />
      </div>
    );
  }

  const retry = (
    <Button size="sm" variant="secondary" onClick={onRetry}>
      Run the Copilot again
    </Button>
  );
  if (kind === "network") {
    return (
      <Alert tone="offline" title={`The API at ${apiUrl} did not answer`} action={retry}>
        Start it with <code className="font-mono text-xs text-ink">pnpm dev</code>, then run the
        Copilot again.
      </Alert>
    );
  }
  return (
    <Alert tone="danger" title="The Copilot run failed" action={retry}>
      {error.message}
    </Alert>
  );
}

function percent(rate: number | null): string {
  return rate === null ? "n/a" : `${Math.round(rate * 100)}%`;
}

function Results({ data }: { data: CopilotData }) {
  const { run, exported } = data;
  const toast = useToast();
  const [filter, setFilter] = useState<RowFilter>("all");
  const rulesJson = useMemo(() => JSON.stringify(exported.rules, null, 2), [exported.rules]);
  const total = run.tickets.length;
  const decidedAlone = total - run.handedToHuman;
  const differs = run.tickets.filter((t) => !t.agrees).length;
  const rows = run.tickets.filter((t) =>
    filter === "differs" ? !t.agrees : filter === "handoff" ? t.handedToHuman : true,
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(exported.systemPrompt);
      toast.toast({ title: "System prompt copied", tone: "ok" });
    } catch {
      toast.toast({ title: "Could not copy the prompt", tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Loop expertName={run.expertName} />
      <StatGroup>
        <Stat
          label="Unsafe auto-actions"
          value={run.unsafeAutoActions}
          unit={`/ ${total}`}
          note="wrong, alone, where a rule applied"
        />
        <Stat
          label="Handed to a human when unsure"
          value={run.handedToHuman}
          unit={`/ ${total}`}
          note="blocks, approvals, judgment calls"
        />
        <Stat
          label={`Agreement on tickets ${run.expertName} never worked`}
          value={percent(run.agreement.rate)}
          note={`${run.agreement.agreed} of ${run.agreement.total} held-out tickets`}
        />
        <Stat
          label="Decided by the Copilot"
          value={decidedAlone}
          unit={`/ ${total}`}
          note={
            <Meter
              value={decidedAlone}
              max={Math.max(1, total)}
              label="Share decided without a person"
              className="mt-1"
            />
          }
        />
      </StatGroup>

      <Panel title="Default policy without the map vs with the map" meta="same tickets" flush>
        <Table>
          <caption className="sr-only">
            The naive default action compared with the Copilot governed by {run.expertName}’s Work
            Map
          </caption>
          <THead>
            <tr>
              <Th className="pl-4">Policy</Th>
              <Th>Unsafe auto-actions</Th>
              <Th>Handed to a human</Th>
              <Th className="pr-4">Agreement</Th>
            </tr>
          </THead>
          <TBody>
            <Tr>
              <th scope="row" className="h-11 pl-4 text-left font-normal text-ink">
                Default policy without the map
              </th>
              <Td>
                <span className="figures">{run.baseline.unsafeAutoActions}</span>
              </Td>
              <Td>
                <span className="figures">0</span>
              </Td>
              <Td className="pr-4">
                <span className="figures">
                  {percent(run.baseline.agreement.rate)} ({run.baseline.agreement.agreed}/
                  {run.baseline.agreement.total})
                </span>
              </Td>
            </Tr>
            <Tr>
              <th scope="row" className="h-11 pl-4 text-left font-medium text-ink">
                With {run.expertName}’s map
              </th>
              <Td>
                <span className="figures font-medium">{run.unsafeAutoActions}</span>
              </Td>
              <Td>
                <span className="figures">{run.handedToHuman}</span>
              </Td>
              <Td className="pr-4">
                <span className="figures">
                  {percent(run.agreement.rate)} ({run.agreement.agreed}/{run.agreement.total})
                </span>
              </Td>
            </Tr>
          </TBody>
        </Table>
      </Panel>

      <Panel
        title="Ticket by ticket"
        meta={`${total} tickets ${run.expertName} never worked`}
        flush
      >
        <div className="flex flex-col gap-2 border-b border-rule px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-muted">
            <strong className="font-medium text-ink">
              Safety policy: the Copilot never takes an irreversible money action alone; a refund
              with no rule clearing it goes to a person.
            </strong>{" "}
            The Copilot starts from the default action, a refund when the ticket names an amount and
            a reply otherwise, and the Work Map’s rules overrule it.{" "}
            {run.judge === "on"
              ? "Each action also went to the language-model judge, the same check a pre-save gets."
              : "Machine rules only: no language-model key is configured, so the judge did not run."}
          </p>
          <div className="shrink-0 overflow-x-auto">
            <SegmentedControl
              label="Show tickets"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All ${total}` },
                { value: "differs", label: `Differs ${differs}`, disabled: differs === 0 },
                {
                  value: "handoff",
                  label: `To a human ${run.handedToHuman}`,
                  disabled: run.handedToHuman === 0,
                },
              ]}
            />
          </div>
        </div>
        <ResultsTable rows={rows} expertName={run.expertName} />
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="The exported policy" meta="system prompt and rule file" flush>
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy aria-hidden="true" />}
              onClick={copyPrompt}
            >
              Copy prompt
            </Button>
            <a
              className={buttonClasses({ variant: "secondary", size: "sm" })}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(rulesJson)}`}
              download={`${run.workMapId}-rules.json`}
            >
              <Download aria-hidden="true" />
              Download rules.json
            </a>
            <span className="ml-auto hidden text-xs text-ink-faint sm:inline">
              {exported.systemPrompt.split("\n").length} lines
            </span>
          </div>
          <pre
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the scrollable preview must be reachable by keyboard
            tabIndex={0}
            className="max-h-80 overflow-auto bg-sunken px-4 py-3 font-mono text-xs leading-5 whitespace-pre-wrap text-ink-muted"
          >
            {exported.systemPrompt}
          </pre>
        </Panel>

        <Panel title="Rules in the policy" meta={`${exported.rules.guardrails.length}`} flush>
          <ul className="divide-y divide-rule">
            {exported.rules.guardrails.map((g) => (
              <li key={g.id} className="flex flex-col gap-1 px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <Badge tone="guard" className="font-mono">
                    {g.id}
                  </Badge>
                  <span className="text-xs text-ink-faint">
                    {g.machineRule ? effectLabel(g.machineRule.effect) : "Judge only"}
                  </span>
                </span>
                <span className="text-ui text-ink">{g.condition}</span>
                <span className="line-clamp-2 text-xs text-ink-muted">“{g.quote}”</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/** The moonshot in one line: the same map goes to people first, then to an agent. */
function Loop({ expertName }: { expertName: string }) {
  const steps = [
    {
      icon: <CircleDot aria-hidden="true" />,
      title: `Captured from ${expertName}`,
      body: "Real tickets, their reasons, their limits",
    },
    {
      icon: <MapIcon aria-hidden="true" />,
      title: "Work Map",
      body: "Every rule backed by a quote and a clip",
    },
    {
      icon: <GraduationCap aria-hidden="true" />,
      title: "Taught to a new hire",
      body: "Coached in the expert’s words, wrong refunds stopped",
    },
    {
      icon: <Bot aria-hidden="true" />,
      title: "Run as a policy",
      body: "Judgment calls go back to a person",
      current: true,
    },
  ];
  return (
    <ol
      aria-label="People first, then agents"
      className="grid gap-px overflow-hidden rounded-panel border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4"
    >
      {steps.map((s, i) => (
        <li
          key={s.title}
          aria-current={s.current ? "step" : undefined}
          className={cx("flex items-start gap-3 px-4 py-3", s.current ? "bg-sunken" : "bg-surface")}
        >
          <span
            aria-hidden="true"
            className={cx(
              "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-control border [&_svg]:size-3.5 [&_svg]:stroke-[1.75]",
              s.current
                ? "border-ink bg-ink text-ink-inverse"
                : "border-rule bg-sunken text-ink-muted",
            )}
          >
            {s.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-ui font-medium text-ink">
              <span className="figures mr-1.5 font-mono text-xs font-normal text-ink-faint">
                {i + 1}
              </span>
              {s.title}
              {s.current ? (
                <span className="ml-2 text-xs font-normal text-ink-faint">this page</span>
              ) : null}
            </span>
            <span className="block text-xs text-ink-muted">{s.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function effectLabel(effect: "BLOCK" | "REQUIRE_APPROVAL" | "WARN"): string {
  return effect === "BLOCK" ? "Blocks" : effect === "REQUIRE_APPROVAL" ? "Needs approval" : "Warns";
}

function ResultsTable({ rows, expertName }: { rows: CopilotTicketResult[]; expertName: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-4">
        <EmptyState title="No tickets match" description="Pick another view to see its tickets." />
      </div>
    );
  }
  return (
    <Table className="min-w-[56rem]">
      <caption className="sr-only">
        Copilot decisions on the held-out tickets, compared with {expertName}’s labels
      </caption>
      <THead>
        <tr>
          <Th className="pl-4">Ticket</Th>
          <Th>Copilot decision</Th>
          <Th>Cited rule</Th>
          <Th>{expertName}’s label</Th>
          <Th>Agreement</Th>
          <Th className="pr-4">Handed to a human</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.ticketId} data-ticket-id={r.ticketId}>
            <th scope="row" className="h-12 py-2 pr-3 pl-4 text-left align-middle font-normal">
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-ink-faint">{r.ticketId}</span>
                <span className="text-ui text-ink">{r.subject}</span>
              </span>
            </th>
            <Td className="py-2">
              <span className="block text-ink">
                {r.decision ? OUTCOME_LABEL[r.decision] : "No action, rule blocks it"}
              </span>
              {r.decision !== r.proposed ? (
                <span className="block text-xs text-ink-faint">
                  instead of {OUTCOME_LABEL[r.proposed].toLowerCase()}
                </span>
              ) : null}
            </Td>
            <Td className="py-2">
              {r.citedGuardrailIds.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {r.citedGuardrailIds.map((id) => (
                    <Badge key={id} tone="guard" className="font-mono">
                      {id}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="text-ink-faint">No rule yet</span>
              )}
            </Td>
            <Td className="py-2">
              <span className="block text-ink">{OUTCOME_LABEL[r.expected]}</span>
              {r.expectedGuardrailIds.length > 0 ? (
                <span className="block font-mono text-xs text-ink-faint">
                  {r.expectedGuardrailIds.join(", ")}
                </span>
              ) : null}
            </Td>
            <Td className="py-2">
              <Badge tone={r.agrees ? "ok" : "danger"} dot>
                {r.agrees ? "Agrees" : "Differs"}
              </Badge>
            </Td>
            <Td className="py-2 pr-4">
              {r.handoffReason === "no_rule_refund" ? (
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
                  Refund with no rule yet → handed to a person
                </span>
              ) : r.handoffReason ? (
                <span className="inline-flex items-center gap-1.5">
                  {r.handoffReason === "judgment_call" ? (
                    <Scale aria-hidden="true" className="size-3.5 shrink-0 text-guard-text" />
                  ) : (
                    <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
                  )}
                  <span className="text-ink">
                    Yes, <span className="text-ink-muted">{HANDOFF_LABEL[r.handoffReason]}</span>
                  </span>
                </span>
              ) : (
                <span className="text-ink-muted">No, Copilot decides</span>
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function LoadingResults() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Running the Work Map over the held-out tickets…</span>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-rule bg-rule sm:grid-cols-4">
        {["a", "b", "c", "d"].map((k) => (
          <div key={k} className="flex flex-col gap-2 bg-surface px-4 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-panel border border-rule bg-surface">
        <div className="flex h-11 items-center border-b border-rule px-4">
          <Skeleton className="h-3.5 w-32" />
        </div>
        {["1", "2", "3", "4", "5", "6"].map((k) => (
          <div
            key={k}
            className="flex h-12 items-center gap-6 border-b border-rule px-4 last:border-b-0"
          >
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="hidden h-3 w-32 sm:block" />
            <Skeleton className="hidden h-5 w-16 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
