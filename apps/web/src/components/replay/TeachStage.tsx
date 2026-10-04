"use client";

import { useMemo } from "react";
import { ACTION_LABELS } from "../desk/ActionBar";
import { InterventionPanel } from "../tutor/InterventionPanel";
import { buildIntervention } from "../tutor/logic";
import { resolveItem } from "../tutor/MasteryReport";
import { Badge } from "../ui/Badge";
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
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-6">
        <ReplayDesk view={frame.desk} queueLabel="Jonas’s queue" />
      </div>
      <div className="lg:col-span-6">
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
      className="relative overflow-hidden rounded-panel border border-rule bg-surface px-5 py-5 sm:px-6"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-signal" />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-2 text-signal-text">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-signal" />
          Shadow asks
        </span>
        <span>
          Ticket <span className="font-mono text-[0.8125rem] text-ink">{ticketId}</span>, never
          handled by Maya
        </span>
      </p>
      <h3 className="mt-2 font-display text-[1.5rem] leading-snug font-normal tracking-[-0.01em] text-ink">
        What would you do here, and why?
      </h3>
      <p className="mt-3 flex min-h-8 flex-wrap items-center gap-2 text-[0.9375rem] text-ink-muted">
        {prediction ? (
          <>
            Jonas predicts <Badge tone="neutral">{ACTION_LABELS[prediction]}</Badge>
          </>
        ) : (
          "Waiting for Jonas to commit to a decision before he acts."
        )}
      </p>
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
    <section
      aria-labelledby="mastery-title"
      className="rounded-panel border border-rule bg-surface"
    >
      <div className="border-b border-rule px-5 py-4 sm:px-6">
        <h3 id="mastery-title" className="font-display text-[1.75rem] leading-tight text-ink">
          Mastery report
        </h3>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">
          Jonas, two unseen tickets, taught from Maya’s Work Map.
        </p>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
        {groups.map((g) => {
          const entries = mastery.entries.filter((e) => e.status === g.status);
          return (
            <div key={g.status} className="flex flex-col gap-1 px-5 py-4 sm:px-6">
              <dt className="order-2 text-sm text-ink-muted">{g.title}</dt>
              <dd className="order-1 font-display text-[2.5rem] leading-none tabular-nums text-ink">
                {entries.length}
              </dd>
              <dd className="order-3 font-mono text-xs text-ink-faint">
                {entries.map((e) => `${e.ticketId}, ${e.stepOrGuardrailId}`).join("; ") || "none"}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="px-5 py-4 sm:px-6">
        <p className="text-sm font-medium text-ink-muted">Practise next</p>
        {practice.map((item) => (
          <figure key={item.id} className="mt-2">
            <p className="text-[0.9375rem] leading-snug text-ink">{practiceTitle(item.id)}</p>
            <blockquote className="mt-2 font-display text-[1.25rem] leading-snug text-ink italic">
              “{item.quote}”
            </blockquote>
            <figcaption className="mt-1 font-mono text-xs text-ink-faint">
              Maya, {item.id}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** "Signs of account takeover: stop; no refund, …" for a guardrail; the step title for a step. */
function practiceTitle(id: string): string {
  const g = sampleWorkMap.guardrails.find((x) => x.id === id);
  if (g) return `${g.condition.charAt(0).toUpperCase()}${g.condition.slice(1)}: ${g.action}`;
  return sampleWorkMap.steps.find((x) => x.id === id)?.title ?? id;
}
