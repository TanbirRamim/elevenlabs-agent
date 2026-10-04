"use client";

import { useMemo } from "react";
import { ACTION_LABELS } from "../desk/ActionBar";
import { InterventionPanel } from "../tutor/InterventionPanel";
import { buildIntervention } from "../tutor/logic";
import { resolveItem } from "../tutor/MasteryReport";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Card";
import { sampleWorkMap } from "../workmap/fixture";
import type { TeachFrame } from "./frame";
import { ReplayDesk } from "./ReplayDesk";
import type { ReplayScript } from "./script";

/**
 * Chapter 3: Jonas on a ticket Maya never handled. The intervention is the real
 * InterventionPanel, built by the tutor's own `buildIntervention` from the guard's verdict and
 * the sample Work Map, so it cites the same rule and quote the live tutor would.
 */
export function TeachStage({ frame, teach }: { frame: TeachFrame; teach: ReplayScript["teach"] }) {
  const intervention = useMemo(
    () => buildIntervention(sampleWorkMap, teach.verdict, teach.ticketId, teach.attempted),
    [teach],
  );
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-6">
        <ReplayDesk view={frame.desk} queueLabel="Jonas’s queue" />
      </div>
      <div className="min-w-0 lg:col-span-6">
        {frame.showMastery ? (
          <MasterySummary teach={teach} />
        ) : frame.showIntervention ? (
          <InterventionPanel
            intervention={intervention}
            expertName={sampleWorkMap.expertName}
            resolvedOutcome={frame.resolvedOutcome}
            tutorNotified
            onReplay={null}
          />
        ) : (
          <Predict prediction={frame.prediction} ticketId={teach.ticketId} />
        )}
      </div>
    </div>
  );
}

function Predict({
  prediction,
  ticketId,
}: {
  prediction: TeachFrame["prediction"];
  ticketId: string;
}) {
  return (
    <section
      aria-label="Predict the decision"
      className="overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2">
        <span className="inline-flex items-center gap-2 text-ui font-semibold text-ask-text">
          <Avatar name="Shadow" size="xs" shadow />
          Shadow asks
        </span>
        <span className="text-xs text-ink-faint">
          Ticket <span className="figures font-mono text-ink-muted">{ticketId}</span>, never handled
          by Maya
        </span>
      </header>
      <div className="flex flex-col gap-3 p-4">
        <h3 className="text-sm font-semibold text-ink">What would you do here, and why?</h3>
        <p className="flex min-h-7 flex-wrap items-center gap-2 text-ui text-ink-muted">
          {prediction ? (
            <>
              Jonas predicts <Badge tone="neutral">{ACTION_LABELS[prediction]}</Badge>
            </>
          ) : (
            "Waiting for Jonas to commit to a decision before he acts."
          )}
        </p>
      </div>
    </section>
  );
}

function MasterySummary({ teach }: { teach: ReplayScript["teach"] }) {
  const { mastery } = teach;
  const groups = [
    { status: "independent", title: "Independent" },
    { status: "assisted", title: "Assisted" },
    { status: "missed", title: "Missed" },
  ] as const;
  const practice = mastery.practiceNext
    .map((id) => resolveItem(sampleWorkMap, id))
    .filter((x) => x !== null);
  return (
    <Panel
      id="mastery"
      title="Mastery report"
      meta="Jonas, two unseen tickets, taught from Maya’s Work Map"
      flush
    >
      <dl className="grid grid-cols-3 gap-px border-b border-rule bg-rule">
        {groups.map((g) => {
          const entries = mastery.entries.filter((e) => e.status === g.status);
          return (
            <div key={g.status} className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3">
              <dt className="text-xs font-medium text-ink-muted">{g.title}</dt>
              <dd className="figures text-2xl leading-8 font-semibold tracking-tight text-ink">
                {entries.length}
              </dd>
              <dd className="truncate font-mono text-2xs text-ink-faint">
                {entries.map((e) => `${e.ticketId}, ${e.stepOrGuardrailId}`).join("; ") || "none"}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs font-medium text-ink-muted">Practise next</p>
        {practice.map((item) => (
          <figure key={item.id}>
            <p className="text-ui font-medium text-ink">{practiceTitle(item.id)}</p>
            <blockquote className="mt-2 border-l-2 border-rule-strong pl-3 text-ui text-ink">
              “{item.quote}”
            </blockquote>
            <figcaption className="figures mt-1.5 font-mono text-2xs text-ink-faint">
              Maya, {item.id}
            </figcaption>
          </figure>
        ))}
      </div>
    </Panel>
  );
}

/** "Signs of account takeover: stop; no refund, …" for a guardrail; the step title for a step. */
function practiceTitle(id: string): string {
  const g = sampleWorkMap.guardrails.find((x) => x.id === id);
  if (g) return `${g.condition.charAt(0).toUpperCase()}${g.condition.slice(1)}: ${g.action}`;
  return sampleWorkMap.steps.find((x) => x.id === id)?.title ?? id;
}
