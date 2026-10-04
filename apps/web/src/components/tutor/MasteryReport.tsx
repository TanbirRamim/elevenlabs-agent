"use client";

import type { Guardrail, MasteryReport as MasteryReportData, Step, WorkMap } from "@shadow/schema";

type Status = MasteryReportData["entries"][number]["status"];

/** What a report id resolves to in the Work Map, so the report can show words, not ids. */
export interface ResolvedItem {
  id: string;
  kind: "step" | "guardrail";
  title: string;
  quote: string;
  frameId: string;
  clip: [number, number];
}

export interface MasteryReportProps {
  report: MasteryReportData;
  /** The published map the session was taught from; resolves ids to titles and quotes. */
  workMap: WorkMap;
  /** Returns the URL of the expert's clip for a step or guardrail, or null when none exists. */
  clipUrlFor?: (ref: { stepOrGuardrailId: string; frameId: string }) => string | null;
}

const GROUPS: { status: Status; title: string; blurb: string }[] = [
  { status: "independent", title: "Independent", blurb: "Did it right without help" },
  { status: "assisted", title: "Assisted", blurb: "Got there after Shadow stepped in" },
  { status: "missed", title: "Missed", blurb: "Still needs practice" },
];

const label = "text-xs font-medium uppercase tracking-wide text-neutral-500";
const numeral = "font-semibold tabular-nums text-neutral-900 dark:text-neutral-50";
const card =
  "rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";

export function resolveItem(workMap: WorkMap, id: string): ResolvedItem | null {
  const step = workMap.steps.find((s: Step) => s.id === id);
  if (step) {
    return {
      id,
      kind: "step",
      title: step.title,
      quote: step.reason.text,
      frameId: step.moment.frameId,
      clip: step.moment.clip,
    };
  }
  const guardrail = workMap.guardrails.find((g: Guardrail) => g.id === id);
  if (guardrail) {
    return {
      id,
      kind: "guardrail",
      title: `${guardrail.action} when ${guardrail.condition}`,
      quote: guardrail.evidence.quote.text,
      frameId: guardrail.evidence.moment.frameId,
      clip: guardrail.evidence.moment.clip,
    };
  }
  return null;
}

/** End-of-session mastery view: every step and guardrail as independent, assisted or missed. */
export function MasteryReport({ report, workMap, clipUrlFor }: MasteryReportProps) {
  const total = report.entries.length;
  return (
    <section
      aria-label="Mastery report"
      className="flex flex-col gap-6 text-neutral-900 dark:text-neutral-100"
    >
      <header>
        <h2 className="text-2xl font-semibold">Mastery report</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {total === 0
            ? `No steps or guardrails from ${workMap.expertName}'s map came up in this session.`
            : `${total} of ${workMap.steps.length + workMap.guardrails.length} steps and guardrails from ${workMap.expertName}'s map came up in this session.`}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {GROUPS.map((group) => {
          const entries = report.entries.filter((e) => e.status === group.status);
          return (
            <section
              key={group.status}
              className={card}
              aria-labelledby={`mastery-${group.status}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={`mastery-${group.status}`} className="text-base font-semibold">
                  {group.title}
                </h3>
                <span data-testid={`count-${group.status}`} className={`text-3xl ${numeral}`}>
                  {entries.length}
                </span>
              </div>
              <p className={`mt-0.5 ${label}`}>{group.blurb}</p>
              {entries.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">Nothing in this group.</p>
              ) : (
                <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
                  {entries.map((entry) => {
                    const item = resolveItem(workMap, entry.stepOrGuardrailId);
                    return (
                      <li
                        key={`${entry.stepOrGuardrailId}:${entry.ticketId}`}
                        className="flex flex-col gap-0.5 py-2"
                      >
                        <span className="text-sm font-medium">
                          {item ? item.title : `Unknown item ${entry.stepOrGuardrailId}`}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {item ? (item.kind === "step" ? "Step" : "Guardrail") : "Not in map"} ·
                          observed on {entry.ticketId}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className={card} aria-labelledby="mastery-practice">
        <h3 id="mastery-practice" className="text-base font-semibold">
          Practice next
        </h3>
        {report.practiceNext.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Nothing to practice. Every step and guardrail that came up was handled.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {report.practiceNext.map((id) => {
              const item = resolveItem(workMap, id);
              const url =
                item && clipUrlFor
                  ? clipUrlFor({ stepOrGuardrailId: id, frameId: item.frameId })
                  : null;
              return (
                <li key={id} className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {item ? item.title : `Unknown item ${id}`}
                  </span>
                  {item ? (
                    <blockquote className="border-l-2 border-neutral-300 pl-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                      “{item.quote}”
                    </blockquote>
                  ) : null}
                  {url ? (
                    <a
                      href={url}
                      className="text-sm font-medium underline underline-offset-4 hover:no-underline"
                    >
                      Watch {workMap.expertName}'s clip
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </section>
  );
}
