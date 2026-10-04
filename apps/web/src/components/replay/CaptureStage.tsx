"use client";

import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { DEFAULT_GATE } from "../../lib/turnGate";
import { REASON_SENTENCES, reasonSentence } from "../insight/reasons";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { sampleWorkMap } from "../workmap/fixture";
import { GuardrailTypeBadge } from "../workmap/primitives";
import type { CaptureFrame } from "./frame";
import { ReplayDesk } from "./ReplayDesk";
import type { LearnedRef } from "./script";

/** Chapter 1: Maya's desk on the left, the Turn Gate's live view and what Shadow learned on the right. */
export function CaptureStage({ frame, timeline }: { frame: CaptureFrame; timeline: ReactNode }) {
  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-7">
        <ReplayDesk view={frame.desk} queueLabel="Maya’s queue" />
        <div className="max-lg:hidden">
          <Learned refs={frame.learned} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
        <GatePanel frame={frame} />
        <div className="border-t border-rule pt-5">{timeline}</div>
        <div className="lg:hidden">
          <Learned refs={frame.learned} />
        </div>
      </div>
    </div>
  );
}

function GatePanel({ frame }: { frame: CaptureFrame }) {
  const { signals, decision, holding, asking, justDropped, sessionMs } = frame;
  const open = decision.open || asking !== null;
  const headline = asking
    ? "Gate open: Shadow asks now"
    : decision.open
      ? reasonSentence(decision)
      : holding
        ? `Holding: ${REASON_SENTENCES[decision.reason].toLowerCase()}`
        : reasonSentence(decision);
  const since = (last: number | null) => (last === null ? null : sessionMs - last);
  return (
    <section aria-labelledby="gate-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="gate-title" className="text-sm font-medium text-ink-muted">
          Turn Gate, live
        </h3>
        <span className="font-mono text-xs text-ink-faint">decide() every 100 ms</span>
      </div>
      <p className="flex items-start gap-2.5 text-[1.25rem] leading-snug text-ink sm:text-[1.375rem]">
        <span
          aria-hidden="true"
          className={cx(
            "mt-2.5 size-2 shrink-0 rounded-full",
            open ? "bg-ask" : holding ? "bg-ink-muted" : "bg-rule-strong",
          )}
        />
        {headline}
      </p>

      <dl className="grid gap-2.5">
        <Meter
          name="Silence"
          value={since(signals.lastUserSpeechMs)}
          need={DEFAULT_GATE.silenceMs}
        />
        <Meter
          name="No typing"
          value={since(signals.lastInputActivityMs)}
          need={DEFAULT_GATE.inputIdleMs}
        />
        <Meter
          name="Screen still"
          value={since(signals.lastScreenChangeMs)}
          need={DEFAULT_GATE.screenIdleMs}
        />
      </dl>

      <div className="min-h-[5.75rem]">
        {asking ? (
          <QuestionNote label="Asking now" text={asking.text} slot={asking.slot} signal />
        ) : holding ? (
          <QuestionNote
            label={`Ready for ${seconds(sessionMs - holding.sinceMs)}, about ${holding.ticketId}`}
            text={holding.text}
            slot={holding.slot}
          />
        ) : justDropped ? (
          <div className="border-l border-rule-strong pl-4">
            <p className="text-sm text-ink-muted">Dropped, never asked</p>
            <p className="mt-1 text-[0.9375rem] leading-snug text-ink-muted line-through decoration-ink-faint">
              {justDropped.text}
            </p>
            <p className="mt-1 text-sm text-ink">{justDropped.reason}.</p>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">
            {frame.asked.length} of {DEFAULT_GATE.maxPer10Min} questions used in these 10 minutes,
            at least {DEFAULT_GATE.minGapMs / 1000} s apart.
          </p>
        )}
      </div>
    </section>
  );
}

function QuestionNote({
  label,
  text,
  slot,
  signal = false,
}: {
  label: string;
  text: string;
  slot: string;
  signal?: boolean;
}) {
  return (
    <div className="relative pl-4">
      <span
        aria-hidden="true"
        className={cx("absolute inset-y-0 left-0 w-0.5", signal ? "bg-ask" : "bg-rule-strong")}
      />
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span className={signal ? "text-ask-text" : undefined}>{label}</span>
        <Badge tone={slot === "guardrail" ? "guard" : "muted"}>
          {slot === "guardrail" ? "Guardrail" : "Reason"}
        </Badge>
      </p>
      <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink">{text}</p>
    </div>
  );
}

function Meter({ name, value, need }: { name: string; value: number | null; need: number }) {
  const ready = value === null || value >= need;
  const f = value === null ? 1 : Math.min(1, value / need);
  return (
    <div className="grid grid-cols-[6.5rem_1fr_6.5rem] items-center gap-3">
      <dt className="text-sm text-ink-muted">{name}</dt>
      <dd aria-hidden="true" className="relative h-3">
        <span className="absolute inset-x-0 top-1/2 h-px bg-rule-strong" />
        <span
          className={cx(
            "absolute inset-x-0 top-1/2 h-0.5 origin-left -translate-y-1/2",
            ready ? "bg-ok" : "bg-ink",
          )}
          style={{ transform: `translateY(-50%) scaleX(${f})` }}
        />
      </dd>
      <dd className="flex items-center justify-end gap-1 font-mono text-xs tabular-nums">
        {ready ? (
          <>
            <Check aria-hidden="true" className="size-3.5 text-ok" />
            <span className="text-ok">ready</span>
          </>
        ) : (
          <span className="text-ink">
            {seconds(value ?? 0)}
            <span className="text-ink-faint"> / {seconds(need)}</span>
          </span>
        )}
      </dd>
    </div>
  );
}

function Learned({ refs }: { refs: LearnedRef[] }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={titleId} className="text-sm font-medium text-ink-muted">
          Learned so far
        </h3>
        <span className="font-mono text-xs text-ink-faint">{refs.length} of 5</span>
      </div>
      {refs.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">
          Nothing yet. Shadow is watching the first ticket.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2.5">
          {refs.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex items-start gap-3">
              <span className="w-[6.5rem] shrink-0">
                {r.kind === "guardrail" ? (
                  <GuardrailTypeBadge type={guardrailType(r.id)} />
                ) : (
                  <Badge tone="muted">Step</Badge>
                )}
              </span>
              <span className="min-w-0 text-[0.9375rem] leading-snug text-ink">{titleOf(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function guardrailType(id: string) {
  return sampleWorkMap.guardrails.find((g) => g.id === id)?.type ?? "limit";
}

function titleOf(r: LearnedRef): string {
  if (r.kind === "step") return sampleWorkMap.steps.find((s) => s.id === r.id)?.title ?? r.id;
  const g = sampleWorkMap.guardrails.find((x) => x.id === r.id);
  return g ? `${capitalize(g.condition)}: ${g.action}` : r.id;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}
