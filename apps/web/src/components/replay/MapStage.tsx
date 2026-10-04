"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { ConfirmedBadge } from "../debrief/ConfirmedBadge";
import { CoverageMeter } from "../debrief/CoverageMeter";
import { TeachBackCard } from "../debrief/TeachBackCard";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Card";
import { cx } from "../ui/cx";
import { sampleWorkMap } from "../workmap/fixture";
import { StepTimeline } from "../workmap/StepTimeline";
import type { MapFrame } from "./frame";
import { focusClass } from "./ReplayDesk";

const noop = () => {};

/**
 * Chapter 2: the debrief. The real CoverageMeter, TeachBackCard and StepTimeline, driven by the
 * script. The recorded controls inside them are inert: this is a replay, not a session.
 */
export function MapStage({ frame }: { frame: MapFrame }) {
  const steps = sampleWorkMap.steps.filter((s) => frame.stepIds.includes(s.id));
  const latest = frame.stepIds.at(-1) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className={cx("flex min-w-0 flex-col gap-4 lg:col-span-7", focusClass(true))}>
        <div className="rounded-panel border border-rule bg-surface p-4">
          <CoverageMeter coverage={frame.coverage} answered={frame.answered} done={frame.done} />
        </div>

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
              <p className="flex flex-wrap items-center gap-2 text-ui text-ink-muted">
                <ConfirmedBadge confirmedAtMs={frame.teachBack.confirmedSessionMs} />
                Maya signed off. The Work Map is ready to teach from.
              </p>
            ) : null}
          </div>
        ) : (
          <Panel
            id="gaps"
            title="What Singoda AI did not see live"
            meta={
              <span className="figures">
                {frame.gaps.filter((g) => g.status === "answered").length} of {frame.gaps.length}{" "}
                answered
              </span>
            }
            flush
          >
            <ol className="divide-y divide-rule">
              {frame.gaps.map((g) => (
                <li
                  key={g.id}
                  className="flex min-h-9 items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cx(
                        "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                        g.status === "answered"
                          ? "border-ok/40 bg-ok-wash text-ok"
                          : g.status === "asking"
                            ? "border-ask bg-ask-wash"
                            : "border-rule-strong",
                      )}
                    >
                      {g.status === "answered" ? <Check className="size-2.5 stroke-[3]" /> : null}
                    </span>
                    <span className="text-ui text-ink">{g.text}</span>
                  </span>
                  <span className="shrink-0">
                    {g.status === "asking" ? (
                      <Badge tone="ask" dot>
                        Asking
                      </Badge>
                    ) : g.status === "answered" ? (
                      <Badge tone="ok">Answered</Badge>
                    ) : (
                      <Badge tone="muted">{g.kind === "unseen" ? "Never seen" : "Exception"}</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>

      <Panel
        id="draft"
        className={cx("lg:col-span-5", focusClass(false))}
        title="Work Map, drafting"
        meta={
          <span className="figures">
            {steps.length} steps, {guardrailCount(steps)} guardrails
          </span>
        }
        footer={
          <Link
            href="/map/latest?fixture=1"
            className="inline-flex items-center gap-1 text-ui font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
          >
            Open this Work Map
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        }
        bodyClassName="p-2"
      >
        <div inert>
          <StepTimeline steps={steps} selectedId={latest} onSelect={noop} />
        </div>
      </Panel>
    </div>
  );
}

function guardrailCount(steps: { guardrailIds: string[] }[]): number {
  return new Set(steps.flatMap((s) => s.guardrailIds)).size;
}
