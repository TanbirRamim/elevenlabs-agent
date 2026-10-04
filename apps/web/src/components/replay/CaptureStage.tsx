"use client";

import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { DEFAULT_GATE } from "../../lib/turnGate";
import { REASON_SENTENCES, reasonSentence } from "../insight/reasons";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Card";
import { cx } from "../ui/cx";
import { sampleWorkMap } from "../workmap/fixture";
import { GuardrailTypeBadge } from "../workmap/primitives";
import type { CaptureFrame } from "./frame";
import { ReplayDesk } from "./ReplayDesk";
import type { LearnedRef } from "./script";

/** Chapter 1: Maya's desk on the left, the Turn Gate's live view and what Shadow learned on the right. */
export function CaptureStage({ frame, timeline }: { frame: CaptureFrame; timeline: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
        <ReplayDesk view={frame.desk} queueLabel="Maya’s queue" />
        <div className="max-lg:hidden">
          <Learned refs={frame.learned} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
        <GatePanel frame={frame} />
        <div className="min-w-0 overflow-hidden rounded-panel border border-rule bg-surface p-4">
          {timeline}
        </div>
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
    <Panel
      id="gate"
      title="Turn Gate, live"
      meta={<span className="hidden font-mono sm:inline">decide() every 100 ms</span>}
      actions={
        <Badge tone={open ? "ask" : "muted"} dot>
          {open ? "Open" : holding ? "Holding" : "Closed"}
        </Badge>
      }
      bodyClassName="flex flex-col gap-4"
    >
      <p className="text-sm font-semibold text-pretty text-ink">{headline}</p>

      <dl className="grid gap-2">
        <GateMeter
          name="Silence"
          value={since(signals.lastUserSpeechMs)}
          need={DEFAULT_GATE.silenceMs}
        />
        <GateMeter
          name="No typing"
          value={since(signals.lastInputActivityMs)}
          need={DEFAULT_GATE.inputIdleMs}
        />
        <GateMeter
          name="Screen still"
          value={since(signals.lastScreenChangeMs)}
          need={DEFAULT_GATE.screenIdleMs}
        />
      </dl>

      <div className="min-h-[5.25rem] border-t border-rule pt-3">
        {asking ? (
          <QuestionNote label="Asking now" text={asking.text} slot={asking.slot} signal />
        ) : holding ? (
          <QuestionNote
            label={`Ready for ${seconds(sessionMs - holding.sinceMs)}, about ${holding.ticketId}`}
            text={holding.text}
            slot={holding.slot}
          />
        ) : justDropped ? (
          <div className="border-l-2 border-rule-strong pl-3">
            <p className="text-xs font-medium text-ink-muted">Dropped, never asked</p>
            <p className="mt-1 text-ui text-ink-muted line-through decoration-ink-faint">
              {justDropped.text}
            </p>
            <p className="mt-1 text-xs text-ink">{justDropped.reason}.</p>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            <span className="figures">
              {frame.asked.length} of {DEFAULT_GATE.maxPer10Min}
            </span>{" "}
            questions used in these 10 minutes, at least {DEFAULT_GATE.minGapMs / 1000} s apart.
          </p>
        )}
      </div>
    </Panel>
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
    <div className={cx("border-l-2 pl-3", signal ? "border-ask" : "border-rule-strong")}>
      <p className="flex flex-wrap items-center gap-2 text-xs font-medium">
        {signal ? <Avatar name="Shadow" size="xs" shadow /> : null}
        <span className={signal ? "text-ask-text" : "text-ink-muted"}>{label}</span>
        <Badge tone={slot === "guardrail" ? "guard" : "muted"}>
          {slot === "guardrail" ? "Guardrail" : "Reason"}
        </Badge>
      </p>
      <p className="mt-1.5 text-ui text-ink">{text}</p>
    </div>
  );
}

function GateMeter({ name, value, need }: { name: string; value: number | null; need: number }) {
  const ready = value === null || value >= need;
  const f = value === null ? 1 : Math.min(1, value / need);
  return (
    <div className="grid grid-cols-[5.5rem_1fr_7rem] items-center gap-3">
      <dt className="text-ui text-ink-muted">{name}</dt>
      <dd aria-hidden="true" className="relative h-1 overflow-hidden rounded-pill bg-rule">
        <span
          className={cx(
            "absolute inset-0 origin-left rounded-pill",
            ready ? "bg-ok-fill" : "bg-ink",
          )}
          style={{ transform: `scaleX(${f})` }}
        />
      </dd>
      <dd className="figures flex items-center justify-end gap-1 font-mono text-xs whitespace-nowrap">
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
  const id = useId();
  return (
    <Panel
      id={`learned-${id.replace(/:/g, "")}`}
      title="Learned so far"
      meta={<span className="figures">{refs.length} of 5</span>}
      flush
    >
      {refs.length === 0 ? (
        <p className="px-4 py-3 text-ui text-ink-faint">
          Nothing yet. Shadow is watching the first ticket.
        </p>
      ) : (
        <ol className="divide-y divide-rule">
          {refs.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex min-h-9 items-center gap-3 px-4 py-2">
              <span className="shrink-0 sm:w-24">
                {r.kind === "guardrail" ? (
                  <GuardrailTypeBadge type={guardrailType(r.id)} />
                ) : (
                  <Badge tone="muted">Step</Badge>
                )}
              </span>
              <span className="min-w-0 text-ui text-ink">{titleOf(r)}</span>
              <span className="figures ml-auto shrink-0 font-mono text-2xs text-ink-faint">
                {r.id}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
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
