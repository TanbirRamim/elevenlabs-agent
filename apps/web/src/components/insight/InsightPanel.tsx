"use client";

import type { CandidateQuestion } from "@shadow/schema";
import type { GateDecision, GateSignals } from "@/lib/turnGate";
import { formatAgo, formatClock, formatMs, formatPercent, formatSeconds } from "./format";
import { reasonSentence } from "./reasons";

/** A question the gate let through, with the pause that opened it. */
export interface AskedQuestion {
  id: string;
  text: string;
  atMs: number;
  pauseMs: { silence: number; inputIdle: number; screenIdle: number };
}

/** The `insight` WebSocket message, minus its `type` tag. */
export interface InsightNumbers {
  visionLatencyMsP90: number | null;
  visionUnreadableFrames: number;
  domVisionAgreement: number | null;
  openGaps: number;
}

export interface InsightPanelProps {
  /** Session clock in ms; the caller ticks it so the timers stay live. */
  now: number;
  signals: GateSignals;
  decision: GateDecision;
  candidates: CandidateQuestion[];
  asked: AskedQuestion[];
  insight: InsightNumbers | null;
  offRecord: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

const label = "text-xs font-medium uppercase tracking-wide text-neutral-500";
const numeral = "font-semibold tabular-nums text-neutral-900 dark:text-neutral-50";
const card =
  "rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900";

/**
 * Judge-facing panel: why Shadow spoke or stayed quiet. Pure props in, UI out; no network.
 * Designed for a second screen: large numerals, muted labels, neutral palette, dark mode.
 */
export function InsightPanel({
  now,
  signals,
  decision,
  candidates,
  asked,
  insight,
  offRecord,
  collapsed = false,
  onToggle,
}: InsightPanelProps) {
  return (
    <aside
      aria-label="Insight panel"
      className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Insight</h2>
          <DecisionChip decision={decision} />
          {offRecord ? (
            <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900">
              Off the record
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm ${numeral}`}>{formatClock(now)}</span>
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-controls="insight-panel-body"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
          ) : null}
        </div>
      </header>

      {collapsed ? (
        <p className="text-sm text-neutral-500">{reasonSentence(decision)}</p>
      ) : (
        <div id="insight-panel-body" className="flex flex-col gap-4">
          <section className={card} aria-labelledby="insight-decision">
            <h3 id="insight-decision" className={label}>
              Gate decision
            </h3>
            <p className="mt-1 text-xl font-semibold">{reasonSentence(decision)}</p>
          </section>

          <section className={card} aria-labelledby="insight-signals">
            <h3 id="insight-signals" className={label}>
              Gate signals
            </h3>
            <dl className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
              <SignalRow name="Expert speech" value={formatAgo(now, signals.lastUserSpeechMs)} />
              <SignalRow
                name="Input activity"
                value={formatAgo(now, signals.lastInputActivityMs)}
              />
              <SignalRow name="Screen change" value={formatAgo(now, signals.lastScreenChangeMs)} />
              <SignalRow name="Shadow" value={signals.agentSpeaking ? "speaking" : "quiet"} />
              <SignalRow name="Recording" value={signals.offRecord ? "off the record" : "on"} />
            </dl>
          </section>

          <section className={card} aria-labelledby="insight-candidates">
            <h3 id="insight-candidates" className={label}>
              Candidates ({candidates.length})
            </h3>
            {candidates.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No open question right now.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {candidates.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{c.text}</span>
                      <span className={`text-sm ${numeral}`}>{c.priority.toFixed(2)}</span>
                    </div>
                    <PriorityBar priority={c.priority} />
                    <p className="text-xs text-neutral-500">
                      {slotLabel(c.slot)}
                      {c.aboutTicketId ? ` · ${c.aboutTicketId}` : ""}
                      {` · ${formatAgo(now, c.createdAtMs)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card} aria-labelledby="insight-asked">
            <h3 id="insight-asked" className={label}>
              Asked ({asked.length})
            </h3>
            {asked.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">Shadow has not asked anything yet.</p>
            ) : (
              <ol className="mt-2 flex flex-col gap-3">
                {asked.map((q) => (
                  <li key={q.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{q.text}</span>
                      <span className={`text-sm ${numeral}`}>{formatClock(q.atMs)}</span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      silence {formatSeconds(q.pauseMs.silence)} · no input{" "}
                      {formatSeconds(q.pauseMs.inputIdle)} · screen still{" "}
                      {formatSeconds(q.pauseMs.screenIdle)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="insight-numbers">
            <h3 id="insight-numbers" className="sr-only">
              Pipeline numbers
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                name="Vision p90"
                value={insight ? formatMs(insight.visionLatencyMsP90) : "—"}
              />
              <StatTile
                name="Unreadable frames"
                value={insight ? String(insight.visionUnreadableFrames) : "—"}
              />
              <StatTile
                name="DOM ↔ vision"
                value={insight ? formatPercent(insight.domVisionAgreement) : "—"}
              />
              <StatTile name="Open gaps" value={insight ? String(insight.openGaps) : "—"} />
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}

function DecisionChip({ decision }: { decision: GateDecision }) {
  const tone = decision.open
    ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
    : "bg-amber-500 text-amber-950 dark:bg-amber-400";
  return (
    <span
      data-testid="gate-chip"
      className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tone}`}
    >
      {decision.open ? "Open" : "Closed"}
    </span>
  );
}

function SignalRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-sm text-neutral-500">{name}</dt>
      <dd className={`text-lg ${numeral}`}>{value}</dd>
    </div>
  );
}

function PriorityBar({ priority }: { priority: number }) {
  const width = `${Math.round(Math.min(1, Math.max(0, priority)) * 100)}%`;
  return (
    // The numeric priority sits next to the bar, so the bar itself is decoration.
    <div
      aria-hidden="true"
      className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
    >
      <div
        data-testid="priority-bar"
        className="h-full rounded-full bg-neutral-700 dark:bg-neutral-300"
        style={{ width }}
      />
    </div>
  );
}

function StatTile({ name, value }: { name: string; value: string }) {
  return (
    <div className={card}>
      <p className={label}>{name}</p>
      <p className={`mt-1 text-3xl ${numeral}`}>{value}</p>
    </div>
  );
}

function slotLabel(slot: CandidateQuestion["slot"]): string {
  switch (slot) {
    case "reason":
      return "Reason";
    case "guardrail":
      return "Guardrail";
    case "exception":
      return "Exception";
    case "escalation_contact":
      return "Escalation contact";
  }
}
