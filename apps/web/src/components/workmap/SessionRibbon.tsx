"use client";

import type { WorkMap } from "@shadow/schema";
import { cx, Tooltip } from "../ui";
import { formatMs } from "./format";

/** The session length the ribbon spans: the last cited moment, rounded up to a whole minute. */
export function sessionSpanMs(map: WorkMap): number {
  const ends = [
    ...map.steps.map((s) => s.moment.clip[1]),
    ...map.guardrails.map((g) => g.evidence.moment.clip[1]),
    ...map.offRecordSpans.map(([, e]) => e),
    map.teachBackConfirmedAtMs ?? 0,
  ];
  const max = Math.max(60_000, ...ends);
  return Math.ceil(max / 60_000) * 60_000;
}

/**
 * The whole capture session on one line, Gong-style: every step at the moment it happened
 * (judgment calls in the guard tone), guardrail quotes as ticks, off-the-record spans hatched.
 * Each step marker is a button that selects the step.
 */
export function SessionRibbon({
  map,
  selectedId,
  onSelect,
}: {
  map: WorkMap;
  selectedId: string | null;
  onSelect: (stepId: string) => void;
}) {
  const span = sessionSpanMs(map);
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / span) * 100))}%`;
  const ticks = Array.from({ length: 5 }, (_, i) => (span / 4) * i);

  return (
    <div className="rounded-panel border border-rule bg-surface px-4 pt-3 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-medium text-ink-muted">Session timeline</p>
        <ul
          aria-label="Legend"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-faint"
        >
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-ink-muted" />
            Step
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rotate-45 rounded-[1px] bg-guard" />
            Judgment call
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-0.5 bg-ink-faint" />
            Rule quoted
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-3 rounded-[1px] border border-rule-strong bg-[repeating-linear-gradient(135deg,var(--sd-rule-strong)_0_2px,transparent_2px_4px)]"
            />
            Off the record
          </li>
        </ul>
      </div>

      <div className="relative mt-3 h-8">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule-strong"
        />
        {map.offRecordSpans.map(([s, e]) => (
          <span
            key={`off-${s}`}
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 rounded-[2px] border border-rule-strong bg-[repeating-linear-gradient(135deg,var(--sd-rule-strong)_0_2px,transparent_2px_5px)]"
            style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }}
          />
        ))}
        {map.guardrails.map((g) => (
          <span
            key={`g-${g.id}`}
            aria-hidden="true"
            className="absolute top-1 bottom-1 w-px bg-ink-faint"
            style={{ left: pct(g.evidence.quote.tMs) }}
          />
        ))}
        {map.steps.map((s) => {
          const selected = s.id === selectedId;
          return (
            <span
              key={s.id}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: pct(s.moment.tMs) }}
            >
              <Tooltip content={`${formatMs(s.moment.tMs)} · ${s.title}`}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-label={`Jump to step ${s.order} at ${formatMs(s.moment.tMs)}`}
                  aria-pressed={selected}
                  className="flex size-6 items-center justify-center rounded-full"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "block transition-transform duration-100",
                      s.judgmentCall ? "size-2.5 rotate-45 rounded-[2px]" : "size-2.5 rounded-full",
                      selected
                        ? "scale-125 bg-ink ring-2 ring-surface"
                        : s.judgmentCall
                          ? "bg-guard"
                          : "bg-ink-muted",
                    )}
                  />
                </button>
              </Tooltip>
            </span>
          );
        })}
      </div>

      <div aria-hidden="true" className="relative mt-0.5 h-4 font-mono text-2xs text-ink-faint">
        {ticks.map((t, i) => (
          <span
            key={t}
            className={cx(
              "figures absolute",
              i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: pct(t) }}
          >
            {formatMs(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
