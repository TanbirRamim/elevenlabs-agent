"use client";

import { type ReactNode, useId, useState } from "react";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { formatSeconds } from "./format";

/**
 * "Why now": a strip chart of the Turn Gate's inputs over a session, with a marker wherever the
 * gate opened and Shadow asked. Pure props in, SVG out; no clocks, no network. Pass `nowMs` to
 * draw it live (content after `nowMs` is not drawn yet).
 *
 * Off-the-record spans are drawn as a grey gap, and nothing that happened inside one is drawn:
 * the chart shows only what Shadow kept.
 */

export interface TimelineSpan {
  startMs: number;
  endMs: number;
}

export interface TimelineQuestion {
  id: string;
  atMs: number;
  text: string;
  slot?: "reason" | "guardrail" | "exception" | "escalation_contact";
  ticketId?: string;
  /** How long each signal had been quiet when the gate opened. Null: it never fired. */
  pause: { silenceMs: number | null; inputIdleMs: number | null; screenIdleMs: number | null };
  /** When the question was ready; the gate held it from then until `atMs`. */
  readyAtMs?: number;
  /** Plain reasons the gate held it, e.g. "Expert is typing". */
  heldBy?: string[];
}

export interface TimelineDropped {
  id: string;
  atMs: number;
  text: string;
  reason: string;
  readyAtMs?: number;
}

export interface GateTimelineProps {
  /** Session time at the left edge. */
  startMs?: number;
  /** Session time at the right edge. */
  endMs: number;
  /** Draw only what happened up to here. Defaults to `endMs` (the whole session). */
  nowMs?: number;
  speech: TimelineSpan[];
  /** Input activity instants (keystrokes, clicks). Bursts are drawn as bars. */
  typing: number[];
  /** Screen change instants. */
  screen: number[];
  offRecord?: TimelineSpan[];
  /** Shadow speaking (asking). */
  asking?: TimelineSpan[];
  questions: TimelineQuestion[];
  /** Questions withdrawn without being asked. */
  dropped?: TimelineDropped[];
  title?: ReactNode;
  className?: string;
}

const LANES = [
  { key: "shadow", long: "Shadow", short: "Shadow" },
  { key: "speech", long: "Expert speech", short: "Speech" },
  { key: "typing", long: "Typing", short: "Typing" },
  { key: "screen", long: "Screen change", short: "Screen" },
] as const;

const W = 1000;
const LANE_H = 100;
const BURST_GAP_MS = 1_200;

const SLOT_LABEL: Record<NonNullable<TimelineQuestion["slot"]>, string> = {
  reason: "Reason",
  guardrail: "Guardrail",
  exception: "Exception",
  escalation_contact: "Escalation contact",
};

/** mm:ss session clock. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const pauseText = (ms: number | null) => (ms === null ? "never fired" : formatSeconds(ms));

/** Spans minus the parts inside any of `holes`. */
export function subtractSpans(spans: TimelineSpan[], holes: TimelineSpan[]): TimelineSpan[] {
  let out = spans;
  for (const h of holes) {
    out = out.flatMap((s) => {
      if (s.endMs <= h.startMs || s.startMs >= h.endMs) return [s];
      const parts: TimelineSpan[] = [];
      if (s.startMs < h.startMs) parts.push({ startMs: s.startMs, endMs: h.startMs });
      if (s.endMs > h.endMs) parts.push({ startMs: h.endMs, endMs: s.endMs });
      return parts;
    });
  }
  return out;
}

/** Groups instants closer than `gapMs` into bursts. */
export function burstsOf(instants: number[], gapMs = BURST_GAP_MS): TimelineSpan[] {
  const sorted = [...instants].sort((a, b) => a - b);
  const out: TimelineSpan[] = [];
  for (const t of sorted) {
    const last = out.at(-1);
    if (last && t - last.endMs <= gapMs) last.endMs = t;
    else out.push({ startMs: t, endMs: t });
  }
  return out;
}

/** The one-paragraph description screen readers get for the chart. */
export function summarizeTimeline(p: GateTimelineProps): string {
  const start = p.startMs ?? 0;
  const now = Math.min(p.nowMs ?? p.endMs, p.endMs);
  const asked = p.questions.filter((q) => q.atMs <= now);
  const off = (p.offRecord ?? []).filter((o) => o.startMs <= now);
  const dropped = (p.dropped ?? []).filter((d) => d.atMs <= now);
  const parts = [
    `Turn Gate timeline from ${clock(start)} to ${clock(now)}: expert speech, typing and screen changes.`,
    asked.length === 0
      ? "No questions asked yet."
      : `${asked.length} ${asked.length === 1 ? "question" : "questions"} asked, each when the gate opened at a pause: ${asked.map((q) => clock(q.atMs)).join(", ")}.`,
  ];
  if (dropped.length > 0) {
    parts.push(
      `${dropped.length} ${dropped.length === 1 ? "question" : "questions"} dropped without asking.`,
    );
  }
  if (off.length > 0) {
    parts.push(
      `Off the record ${off.map((o) => `${clock(o.startMs)} to ${clock(Math.min(o.endMs, now))}`).join(", ")}; nothing from that span is shown or stored.`,
    );
  }
  return parts.join(" ");
}

export function GateTimeline(props: GateTimelineProps) {
  const {
    startMs = 0,
    endMs,
    speech,
    typing,
    screen,
    offRecord = [],
    asking = [],
    questions,
    dropped = [],
    title = "Why now: the Turn Gate",
    className,
  } = props;
  const now = Math.max(startMs, Math.min(props.nowMs ?? endMs, endMs));
  const span = Math.max(1, endMs - startMs);
  const x = (t: number) => ((Math.min(Math.max(t, startMs), endMs) - startMs) / span) * W;
  const pct = (t: number) => `${(x(t) / W) * 100}%`;
  const [active, setActive] = useState<string | null>(null);
  const uid = useId();
  const summary = summarizeTimeline(props);

  // Only what had happened by `now`, and nothing from off the record.
  const visibleOff = offRecord
    .filter((o) => o.startMs <= now)
    .map((o) => ({ ...o, endMs: Math.min(o.endMs, now) }));
  const clip = (spans: TimelineSpan[]) =>
    subtractSpans(
      spans.filter((s) => s.startMs <= now).map((s) => ({ ...s, endMs: Math.min(s.endMs, now) })),
      offRecord,
    );
  const speechSpans = clip(speech);
  const askingSpans = clip(asking);
  const typingBursts = clip(burstsOf(typing.filter((t) => t <= now)));
  const screenTicks = screen.filter(
    (t) => t <= now && !offRecord.some((o) => t >= o.startMs && t < o.endMs),
  );
  const shownQuestions = questions.filter((q) => q.atMs <= now);
  const shownDropped = dropped.filter((d) => d.atMs <= now);
  const holds = [
    ...questions.map((q) => ({ id: q.id, startMs: q.readyAtMs, endMs: q.atMs })),
    ...dropped.map((d) => ({ id: d.id, startMs: d.readyAtMs, endMs: d.atMs })),
  ].flatMap((h) =>
    h.startMs === undefined || h.startMs > now
      ? []
      : [{ id: h.id, startMs: h.startMs, endMs: Math.min(h.endMs, now) }],
  );

  const ticks = minuteTicks(startMs, endMs);
  const bar = (lane: number, s: TimelineSpan, minW: number, cls: string, key: string) => {
    const x0 = x(s.startMs);
    const w = Math.max(minW, x(s.endMs) - x0);
    return <rect key={key} x={x0} y={lane * LANE_H + 28} width={w} height={44} className={cls} />;
  };

  return (
    <figure className={cx("min-w-0", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span className="text-sm font-medium text-ink">{title}</span>
        <Legend />
      </figcaption>

      <div className="mt-3 grid grid-cols-[3.75rem_1fr] gap-x-3 sm:grid-cols-[7rem_1fr]">
        <ul aria-hidden="true" className="flex flex-col">
          {LANES.map((l) => (
            <li
              key={l.key}
              className="flex h-8 items-center text-xs text-ink-muted sm:text-[0.8125rem]"
            >
              <span className="sm:hidden">{l.short}</span>
              <span className="hidden sm:inline">{l.long}</span>
            </li>
          ))}
        </ul>

        <div className="relative min-w-0">
          <div role="img" aria-label={summary} className="relative h-32">
            {/* Lane hairlines. */}
            <div aria-hidden="true" className="absolute inset-0 flex flex-col">
              {LANES.map((l) => (
                <div key={l.key} className="h-8 border-b border-rule first:border-t" />
              ))}
            </div>
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${W} ${LANES.length * LANE_H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              {visibleOff.map((o) => (
                <rect
                  key={`off-${o.startMs}`}
                  x={x(o.startMs)}
                  y={0}
                  width={Math.max(0, x(o.endMs) - x(o.startMs))}
                  height={LANES.length * LANE_H}
                  className="fill-sunken"
                />
              ))}
              {holds.map((h) => bar(0, h, 0, "fill-ink-faint/30", `hold-${h.id}`))}
              {askingSpans.map((s, i) => bar(0, s, 2, "fill-signal", `ask-${i}`))}
              {speechSpans.map((s, i) => bar(1, s, 1.5, "fill-ink-muted", `sp-${i}`))}
              {typingBursts.map((s, i) => bar(2, s, 1.5, "fill-ink-muted", `ty-${i}`))}
              {screenTicks.map((t) => (
                <line
                  key={`sc-${t}`}
                  x1={x(t)}
                  x2={x(t)}
                  y1={3 * LANE_H + 22}
                  y2={3 * LANE_H + 78}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-ink-muted"
                  strokeWidth={1.25}
                />
              ))}
              {shownQuestions.map((q) => (
                <line
                  key={`ql-${q.id}`}
                  x1={x(q.atMs)}
                  x2={x(q.atMs)}
                  y1={LANE_H / 2}
                  y2={LANES.length * LANE_H}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-signal"
                  strokeWidth={1.5}
                />
              ))}
              {now < endMs ? (
                <line
                  x1={x(now)}
                  x2={x(now)}
                  y1={0}
                  y2={LANES.length * LANE_H}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-ink"
                  strokeWidth={1.5}
                />
              ) : null}
            </svg>
            {visibleOff.map((o) =>
              x(o.endMs) - x(o.startMs) > 40 ? (
                <span
                  key={`offl-${o.startMs}`}
                  aria-hidden="true"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-mono text-[0.6875rem] leading-tight text-ink-muted"
                  style={{ left: pct((o.startMs + o.endMs) / 2) }}
                >
                  Off the
                  <br />
                  record
                </span>
              ) : null,
            )}
          </div>

          {/* Markers: real buttons so the reasons are reachable by keyboard, not only by hover. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8">
            {shownQuestions.map((q, i) => (
              <Marker
                key={q.id}
                id={`${uid}-${q.id}`}
                left={pct(q.atMs)}
                align={x(q.atMs) / W}
                open={active === q.id}
                onOpen={() => setActive(q.id)}
                onClose={() => setActive((a) => (a === q.id ? null : a))}
                label={`Question ${i + 1} at ${clock(q.atMs)}`}
                kind="asked"
                number={i + 1}
              >
                <QuestionTip q={q} index={i + 1} />
              </Marker>
            ))}
            {shownDropped.map((d) => (
              <Marker
                key={d.id}
                id={`${uid}-${d.id}`}
                left={pct(d.atMs)}
                align={x(d.atMs) / W}
                open={active === d.id}
                onOpen={() => setActive(d.id)}
                onClose={() => setActive((a) => (a === d.id ? null : a))}
                label={`Question dropped at ${clock(d.atMs)}`}
                kind="dropped"
              >
                <p className="font-mono text-xs text-ink-faint">
                  Dropped at {clock(d.atMs)}, never asked
                </p>
                <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink">“{d.text}”</p>
                <p className="mt-2 text-sm text-ink-muted">{d.reason}.</p>
              </Marker>
            ))}
          </div>

          <div
            aria-hidden="true"
            className="relative mt-1 h-5 font-mono text-[0.6875rem] text-ink-faint"
          >
            {ticks.map((t, i) => (
              <span
                key={t}
                className={cx(
                  "absolute -translate-x-1/2 tabular-nums",
                  i === 0 && "translate-x-0",
                  i % 2 === 1 && "max-sm:hidden",
                )}
                style={{ left: pct(t) }}
              >
                {clock(t)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="sr-only">
        <table>
          <caption>Questions Shadow asked, and the pause that let each one through</caption>
          <thead>
            <tr>
              <th scope="col">Number</th>
              <th scope="col">Time</th>
              <th scope="col">Question</th>
              <th scope="col">Slot</th>
              <th scope="col">Silence</th>
              <th scope="col">No input</th>
              <th scope="col">Screen still</th>
              <th scope="col">Held back because</th>
            </tr>
          </thead>
          <tbody>
            {shownQuestions.map((q, i) => (
              <tr key={q.id}>
                <td>{i + 1}</td>
                <td>{clock(q.atMs)}</td>
                <td>{q.text}</td>
                <td>{q.slot ? SLOT_LABEL[q.slot] : "Not given"}</td>
                <td>{pauseText(q.pause.silenceMs)}</td>
                <td>{pauseText(q.pause.inputIdleMs)}</td>
                <td>{pauseText(q.pause.screenIdleMs)}</td>
                <td>{q.heldBy && q.heldBy.length > 0 ? q.heldBy.join(", then ") : "Not held"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function QuestionTip({ q, index }: { q: TimelineQuestion; index: number }) {
  const held = q.readyAtMs !== undefined ? q.atMs - q.readyAtMs : null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-faint">
          Question {index} at {clock(q.atMs)}
          {q.ticketId ? `, ticket ${q.ticketId}` : ""}
        </span>
        {q.slot ? (
          <Badge tone={q.slot === "guardrail" ? "signal" : "muted"}>{SLOT_LABEL[q.slot]}</Badge>
        ) : null}
      </div>
      <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink">“{q.text}”</p>
      <p className="mt-2.5 text-sm text-ink-muted">The gate opened after:</p>
      <dl className="mt-1 grid grid-cols-3 gap-2 font-mono text-xs">
        <PauseStat name="Silence" value={pauseText(q.pause.silenceMs)} />
        <PauseStat name="No input" value={pauseText(q.pause.inputIdleMs)} />
        <PauseStat name="Screen still" value={pauseText(q.pause.screenIdleMs)} />
      </dl>
      {held !== null && held > 0 ? (
        <p className="mt-2.5 text-sm text-ink-muted">
          Held {formatSeconds(held)}
          {q.heldBy && q.heldBy.length > 0 ? `: ${q.heldBy.join(", then ").toLowerCase()}` : ""}.
        </p>
      ) : null}
    </>
  );
}

function PauseStat({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-ink-faint">{name}</dt>
      <dd className="text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function Marker({
  id,
  left,
  align,
  open,
  onOpen,
  onClose,
  label,
  kind,
  number,
  children,
}: {
  id: string;
  left: string;
  /** 0..1 position across the chart; keeps the tooltip inside the chart. */
  align: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  label: string;
  kind: "asked" | "dropped";
  number?: number;
  children: ReactNode;
}) {
  const tipId = `${id}-tip`;
  return (
    <div className="absolute top-1/2" style={{ left }}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={onOpen}
        onMouseLeave={onClose}
        onFocus={onOpen}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="pointer-events-auto absolute top-0 left-0 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex size-[22px] items-center justify-center rounded-full border font-mono text-[0.6875rem] tabular-nums",
            kind === "asked"
              ? "border-signal bg-signal text-signal-ink"
              : "border-ink-faint bg-canvas text-ink-faint",
          )}
        >
          {kind === "asked" ? number : "×"}
        </span>
      </button>
      {open ? (
        <div
          id={tipId}
          role="tooltip"
          className={cx(
            "absolute top-6 z-20 w-[17.5rem] rounded-panel border border-rule-strong bg-surface p-3.5 shadow-raised",
            align < 0.3 ? "-left-5" : align > 0.7 ? "-right-5" : "-translate-x-1/2",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function Legend() {
  const item = (swatch: ReactNode, text: string) => (
    <li className="inline-flex items-center gap-1.5">
      {swatch}
      {text}
    </li>
  );
  return (
    <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {item(<span className="h-2 w-3 rounded-[1px] bg-ink-faint/30" />, "Holding a question")}
      {item(<span className="size-2.5 rounded-full bg-signal" />, "Asked at a pause")}
      {item(
        <span className="h-2 w-3 rounded-[1px] bg-sunken ring-1 ring-rule" />,
        "Off the record",
      )}
    </ul>
  );
}

function minuteTicks(startMs: number, endMs: number): number[] {
  const span = endMs - startMs;
  const step = span <= 6 * 60_000 ? 60_000 : span <= 14 * 60_000 ? 120_000 : 300_000;
  const out: number[] = [];
  for (let t = Math.ceil(startMs / step) * step; t <= endMs - step / 3; t += step) out.push(t);
  return out;
}
