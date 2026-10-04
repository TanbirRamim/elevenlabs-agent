"use client";

import type { CandidateQuestion } from "@shadow/schema";
import { ChevronDown, ChevronUp, EyeOff, Pause } from "lucide-react";
import type { ReactNode } from "react";
import type { GateDecision, GateSignals } from "@/lib/turnGate";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Stat, StatGroup } from "../ui/Stat";
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
  /** Recording is paused: the gate is not running, so its last decision is not live. */
  paused?: boolean;
  /** The live "why now" chart (a GateTimeline), drawn at the top of the body. */
  timeline?: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}

const PAUSED_SENTENCE = "Recording is paused: Singoda AI holds every question";

/**
 * Judge-facing panel: why Singoda AI spoke or stayed quiet. Pure props in, UI out; no network.
 * Dense and tokenised so it reads on a projector in both schemes.
 */
export function InsightPanel({
  now,
  signals,
  decision,
  candidates,
  asked,
  insight,
  offRecord,
  paused = false,
  timeline,
  collapsed = false,
  onToggle,
}: InsightPanelProps) {
  const sentence = paused ? PAUSED_SENTENCE : reasonSentence(decision);
  return (
    <aside
      aria-label="Insight panel"
      className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-rule px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-ui font-semibold text-ink">Insight</h2>
          <span className="hidden text-xs text-ink-faint sm:inline">
            Why Singoda AI asks or waits
          </span>
          {paused ? (
            <Badge tone="muted" icon={<Pause aria-hidden="true" />}>
              Paused
            </Badge>
          ) : (
            <DecisionChip decision={decision} />
          )}
          {offRecord ? (
            <Badge tone="muted" icon={<EyeOff aria-hidden="true" />}>
              Off the record
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="figures font-mono text-ui text-ink-muted">{formatClock(now)}</span>
          {onToggle ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-controls="insight-panel-body"
              icon={collapsed ? <ChevronDown /> : <ChevronUp />}
            >
              {collapsed ? "Expand" : "Collapse"}
            </Button>
          ) : null}
        </div>
      </header>

      {collapsed ? (
        <p className="px-4 py-2.5 text-ui text-ink-muted">{sentence}</p>
      ) : (
        <div id="insight-panel-body" className="flex flex-col">
          <section
            aria-labelledby="insight-decision"
            className="flex flex-col gap-3 border-b border-rule px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 id="insight-decision" className="text-xs font-medium text-ink-muted">
                Gate decision
              </h3>
              <span className="text-xs text-ink-faint">evaluated every 250 ms</span>
            </div>
            <p
              className={cx(
                "text-sm font-semibold",
                !paused && decision.open ? "text-ask-text" : "text-ink",
              )}
            >
              {sentence}
            </p>
            {timeline}
          </section>

          <div className="grid grid-cols-1 divide-y divide-rule lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <Block id="insight-signals" title="Gate signals">
              <dl className="divide-y divide-rule">
                <SignalRow name="Expert speech" value={formatAgo(now, signals.lastUserSpeechMs)} />
                <SignalRow
                  name="Input activity"
                  value={formatAgo(now, signals.lastInputActivityMs)}
                />
                <SignalRow
                  name="Screen change"
                  value={formatAgo(now, signals.lastScreenChangeMs)}
                />
                <SignalRow name="Singoda AI" value={signals.agentSpeaking ? "speaking" : "quiet"} />
                <SignalRow name="Recording" value={signals.offRecord ? "off the record" : "on"} />
              </dl>
            </Block>

            <Block id="insight-candidates" title="Candidates" count={candidates.length}>
              {candidates.length === 0 ? (
                <p className="text-ui text-ink-faint">No open question right now.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {candidates.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-ui text-ink">{c.text}</span>
                        <span className="figures font-mono text-ui text-ink">
                          {c.priority.toFixed(2)}
                        </span>
                      </div>
                      <PriorityBar priority={c.priority} />
                      <p className="text-xs text-ink-faint">
                        {slotLabel(c.slot)}
                        {c.aboutTicketId ? ` · ${c.aboutTicketId}` : ""}
                        {` · ${formatAgo(now, c.createdAtMs)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block id="insight-asked" title="Asked" count={asked.length}>
              {asked.length === 0 ? (
                <p className="text-ui text-ink-faint">Singoda AI has not asked anything yet.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {asked.map((q) => (
                    <li key={q.id} className="grid grid-cols-[3rem_1fr] gap-x-2">
                      <span className="figures pt-px font-mono text-xs text-ask-text">
                        {formatClock(q.atMs)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-ui text-ink">{q.text}</p>
                        <p className="mt-0.5 font-mono text-2xs text-ink-faint">
                          silence {formatSeconds(q.pauseMs.silence)} · no input{" "}
                          {formatSeconds(q.pauseMs.inputIdle)} · screen still{" "}
                          {formatSeconds(q.pauseMs.screenIdle)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Block>
          </div>

          <section aria-labelledby="insight-numbers" className="border-t border-rule p-4">
            <h3 id="insight-numbers" className="sr-only">
              Pipeline numbers
            </h3>
            <StatGroup>
              <Stat
                label="Vision p90"
                value={insight ? formatMs(insight.visionLatencyMsP90) : "—"}
                note="frame to screen event"
              />
              <Stat
                label="Unreadable frames"
                value={insight ? String(insight.visionUnreadableFrames) : "—"}
                note="vision could not read"
              />
              <Stat
                label="DOM ↔ vision"
                value={insight ? formatPercent(insight.domVisionAgreement) : "—"}
                note="agreement"
              />
              <Stat
                label="Open gaps"
                value={insight ? String(insight.openGaps) : "—"}
                note="left for the debrief"
              />
            </StatGroup>
            {insight === null ? (
              <p className="mt-2 text-xs text-ink-faint">
                These fill in when the API reports its first numbers for this session.
              </p>
            ) : null}
          </section>
        </div>
      )}
    </aside>
  );
}

function Block({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 px-4 py-3">
      <h3 id={id} className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        {title}
        {count !== undefined ? (
          <span className="figures rounded-control bg-sunken px-1.5 font-mono text-2xs text-ink-muted">
            {count}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function DecisionChip({ decision }: { decision: GateDecision }) {
  return (
    <Badge data-testid="gate-chip" tone={decision.open ? "ask" : "muted"} dot>
      {decision.open ? "Open" : "Closed"}
    </Badge>
  );
}

function SignalRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-ui text-ink-muted">{name}</dt>
      <dd className="figures font-mono text-ui text-ink">{value}</dd>
    </div>
  );
}

function PriorityBar({ priority }: { priority: number }) {
  const width = `${Math.round(Math.min(1, Math.max(0, priority)) * 100)}%`;
  return (
    // The numeric priority sits next to the bar, so the bar itself is decoration.
    <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-pill bg-rule">
      <div
        data-testid="priority-bar"
        className="h-full rounded-pill bg-ink-muted"
        style={{ width }}
      />
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
