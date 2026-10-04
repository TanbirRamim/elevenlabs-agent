"use client";

import type { Guardrail, MasteryReport as MasteryReportData, Step, WorkMap } from "@shadow/schema";
import { Play } from "lucide-react";
import { Badge, type BadgeTone, Button, cx, DOT_TONES } from "../ui";
import { formatClip } from "../workmap/format";

type Status = MasteryReportData["entries"][number]["status"];

/** What a report id resolves to in the Work Map, so the report can show words, not ids. */
export interface ResolvedItem {
  id: string;
  kind: "step" | "guardrail";
  title: string;
  quote: string;
  frameId: string;
  /** Session time of the expert's screen moment. */
  tMs: number;
  clip: [number, number];
}

export interface MasteryReportProps {
  report: MasteryReportData;
  /** The published map the session was taught from; resolves ids to titles and quotes. */
  workMap: WorkMap;
  /** Returns the URL of the expert's clip for a step or guardrail, or null when none exists. */
  clipUrlFor?: (ref: { stepOrGuardrailId: string; frameId: string }) => string | null;
  /** Opens the expert's clip in place (e.g. the clip dialog); used instead of `clipUrlFor`. */
  onPlayClip?: (item: ResolvedItem) => void;
}

const GROUPS: { status: Status; title: string; blurb: string; tone: BadgeTone }[] = [
  { status: "independent", title: "Independent", blurb: "Did it right without help", tone: "ok" },
  {
    status: "assisted",
    title: "Assisted",
    blurb: "Got there after Shadow stepped in",
    tone: "guard",
  },
  { status: "missed", title: "Missed", blurb: "Still needs practice", tone: "danger" },
];

export function resolveItem(workMap: WorkMap, id: string): ResolvedItem | null {
  const step = workMap.steps.find((s: Step) => s.id === id);
  if (step) {
    return {
      id,
      kind: "step",
      title: step.title,
      quote: step.reason.text,
      frameId: step.moment.frameId,
      tMs: step.moment.tMs,
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
      tMs: guardrail.evidence.moment.tMs,
      clip: guardrail.evidence.moment.clip,
    };
  }
  return null;
}

/** End-of-session mastery view: every step and guardrail as independent, assisted or missed. */
export function MasteryReport({ report, workMap, clipUrlFor, onPlayClip }: MasteryReportProps) {
  const total = report.entries.length;
  const mapSize = workMap.steps.length + workMap.guardrails.length;
  const counts = Object.fromEntries(
    GROUPS.map((g) => [g.status, report.entries.filter((e) => e.status === g.status).length]),
  ) as Record<Status, number>;

  const clipControl = (item: ResolvedItem, id: string) => {
    if (onPlayClip) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPlayClip(item)}
          icon={<Play aria-hidden="true" className="fill-current" />}
          className="-ml-2 w-fit"
        >
          Watch {workMap.expertName}'s clip
          <span className="figures font-mono text-xs text-ink-faint">{formatClip(item.clip)}</span>
        </Button>
      );
    }
    const url = clipUrlFor ? clipUrlFor({ stepOrGuardrailId: id, frameId: item.frameId }) : null;
    return url ? (
      <a
        href={url}
        className="w-fit text-ui font-medium text-ink underline underline-offset-4 hover:no-underline"
      >
        Watch {workMap.expertName}'s clip
      </a>
    ) : null;
  };

  return (
    <section aria-label="Mastery report" className="flex flex-col gap-4 text-ink">
      <div className="overflow-hidden rounded-panel border border-rule bg-surface">
        <div className="flex flex-col gap-1 px-4 pt-4">
          <h2 className="text-sm font-semibold">Mastery report</h2>
          <p className="text-ui text-ink-muted">
            {total === 0
              ? `No steps or guardrails from ${workMap.expertName}'s map came up in this session.`
              : `${total} of ${mapSize} steps and guardrails from ${workMap.expertName}'s map came up in this session.`}
          </p>
        </div>
        {total > 0 ? (
          <div
            className="mx-4 mt-4 flex h-1.5 overflow-hidden rounded-full bg-sunken"
            role="img"
            aria-label={`${counts.independent} independent, ${counts.assisted} assisted, ${counts.missed} missed`}
          >
            {GROUPS.map((g) =>
              counts[g.status] > 0 ? (
                <span
                  key={g.status}
                  className={cx(
                    "h-full border-r-2 border-surface last:border-r-0",
                    DOT_TONES[g.tone],
                  )}
                  style={{ width: `${(counts[g.status] / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
        ) : null}
        <dl className="mt-4 grid grid-cols-3 gap-px border-t border-rule bg-rule">
          {GROUPS.map((g) => (
            <div key={g.status} className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <span
                  aria-hidden="true"
                  className={cx("size-1.5 rounded-full", DOT_TONES[g.tone])}
                />
                {g.title}
              </dt>
              <dd
                data-testid={`count-${g.status}`}
                className="figures text-2xl leading-8 font-semibold text-ink"
              >
                {counts[g.status]}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {GROUPS.map((group) => {
          const entries = report.entries.filter((e) => e.status === group.status);
          return (
            <section
              key={group.status}
              className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface"
              aria-labelledby={`mastery-${group.status}`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
                <div className="min-w-0">
                  <h3 id={`mastery-${group.status}`} className="text-ui font-semibold">
                    {group.title}
                  </h3>
                  <p className="text-xs text-ink-muted">{group.blurb}</p>
                </div>
                <Badge tone={entries.length > 0 ? group.tone : "muted"} dot={entries.length > 0}>
                  {entries.length}
                </Badge>
              </header>
              {entries.length === 0 ? (
                <p className="px-4 py-3 text-ui text-ink-faint">Nothing in this group.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-rule">
                  {entries.map((entry) => {
                    const item = resolveItem(workMap, entry.stepOrGuardrailId);
                    return (
                      <li
                        key={`${entry.stepOrGuardrailId}:${entry.ticketId}`}
                        className="flex flex-col gap-1 px-4 py-3"
                      >
                        <span className="text-ui font-medium">
                          {item ? item.title : `Unknown item ${entry.stepOrGuardrailId}`}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {item ? (item.kind === "step" ? "Step" : "Guardrail") : "Not in map"} ·
                          observed on {entry.ticketId}
                        </span>
                        {item ? (
                          <blockquote className="mt-1 border-l-2 border-rule-strong pl-2.5 text-ui text-pretty text-ink-muted">
                            “{item.quote}”
                          </blockquote>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section
        className="overflow-hidden rounded-panel border border-rule bg-surface"
        aria-labelledby="mastery-practice"
      >
        <header className="border-b border-rule px-4 py-2.5">
          <h3 id="mastery-practice" className="text-ui font-semibold">
            Practice next
          </h3>
        </header>
        {report.practiceNext.length === 0 ? (
          <p className="px-4 py-3 text-ui text-ink-muted">
            Nothing to practice. Every step and guardrail that came up was handled.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-rule">
            {report.practiceNext.map((id, i) => {
              const item = resolveItem(workMap, id);
              return (
                <li key={id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 px-4 py-3">
                  <span className="col-start-2 row-start-1 text-ui font-medium">
                    {item ? item.title : `Unknown item ${id}`}
                  </span>
                  <div className="col-start-2 row-start-2 flex flex-col gap-1.5">
                    {item ? (
                      <blockquote className="border-l-2 border-rule-strong pl-2.5 text-ui text-pretty text-ink-muted">
                        “{item.quote}”
                      </blockquote>
                    ) : null}
                    {item ? clipControl(item, id) : null}
                  </div>
                  <span
                    aria-hidden="true"
                    className="figures col-start-1 row-start-1 pt-0.5 font-mono text-xs text-ink-faint"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </section>
  );
}
