"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { ConfirmedBadge } from "../debrief/ConfirmedBadge";
import { CoverageMeter } from "../debrief/CoverageMeter";
import { TeachBackCard } from "../debrief/TeachBackCard";
import { Badge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { sampleWorkMap } from "../workmap/fixture";
import { StepTimeline } from "../workmap/StepTimeline";
import type { MapFrame } from "./frame";

const noop = () => {};

/**
 * Chapter 2: the debrief. The real CoverageMeter, TeachBackCard and StepTimeline, driven by the
 * script. The recorded controls inside them are inert: this is a replay, not a session.
 */
export function MapStage({ frame }: { frame: MapFrame }) {
  const steps = sampleWorkMap.steps.filter((s) => frame.stepIds.includes(s.id));
  const latest = frame.stepIds.at(-1) ?? null;
  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-7">
        <CoverageMeter coverage={frame.coverage} answered={frame.answered} done={frame.done} />

        {frame.teachBack ? (
          <div className="flex flex-col gap-3">
            <div inert>
              <TeachBackCard
                text={frame.teachBack.text}
                recheck={frame.teachBack.recheck}
                round={frame.teachBack.round}
                maxRounds={2}
                mode="reading"
                busy={false}
                onConfirm={noop}
                onCorrect={noop}
                onCancelCorrection={noop}
              />
            </div>
            {frame.teachBack.confirmedSessionMs !== null ? (
              <p className="flex flex-wrap items-center gap-3 text-[0.9375rem] text-ink-muted">
                <ConfirmedBadge confirmedAtMs={frame.teachBack.confirmedSessionMs} />
                Maya signed off. The Work Map is ready to teach from.
              </p>
            ) : null}
          </div>
        ) : (
          <section aria-labelledby="gaps-title">
            <h3 id="gaps-title" className="text-sm font-medium text-ink-muted">
              What Shadow did not see live
            </h3>
            <ol className="mt-2 divide-y divide-rule border-y border-rule">
              {frame.gaps.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cx(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                        g.status === "answered"
                          ? "border-ok bg-ok-wash text-ok"
                          : g.status === "asking"
                            ? "border-signal bg-signal-wash"
                            : "border-rule-strong",
                      )}
                    >
                      {g.status === "answered" ? <Check className="size-3" /> : null}
                    </span>
                    <span className="text-[0.9375rem] leading-snug text-ink">{g.text}</span>
                  </span>
                  <span className="shrink-0 text-sm">
                    {g.status === "asking" ? (
                      <span className="text-signal-text">Asking</span>
                    ) : g.status === "answered" ? (
                      <span className="text-ok">Answered</span>
                    ) : (
                      <span className="text-ink-faint">
                        {g.kind === "unseen" ? "Never seen" : "Exception"}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <section aria-labelledby="draft-title" className="lg:col-span-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="draft-title" className="text-sm font-medium text-ink-muted">
            Work Map, drafting
          </h3>
          <span className="flex items-center gap-2">
            <Badge tone="muted">
              {steps.length} steps, {guardrailCount(steps)} guardrails
            </Badge>
          </span>
        </div>
        <div inert className="mt-2">
          <StepTimeline steps={steps} selectedId={latest} onSelect={noop} />
        </div>
        <Link
          href="/map/latest?fixture=1"
          className="mt-3 inline-flex min-h-10 items-center text-[0.9375rem] underline decoration-rule-strong underline-offset-[6px] hover:decoration-ink"
        >
          Open this Work Map
        </Link>
      </section>
    </div>
  );
}

function guardrailCount(steps: { guardrailIds: string[] }[]): number {
  return new Set(steps.flatMap((s) => s.guardrailIds)).size;
}
