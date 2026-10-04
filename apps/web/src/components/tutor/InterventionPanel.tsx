"use client";

import type { Guardrail, Outcome } from "@shadow/schema";
import { ArrowRight, CircleCheck, Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { ACTION_LABELS, shortcutFor } from "@/components/desk/ActionBar";
import { Avatar, Badge, Button, cx, Kbd } from "@/components/ui";
import { NO_REPLAY_NOTE } from "@/components/workmap/ClipPlayer";
import { formatClip, formatMs, SOURCE_LABEL } from "@/components/workmap/format";
import { GuardrailTypeBadge } from "@/components/workmap/primitives";
import type { Intervention } from "./logic";

export interface InterventionPanelProps {
  intervention: Intervention;
  expertName: string;
  /** The outcome the learner saved on this ticket after the pause, once it went through. */
  resolvedOutcome: Outcome | null;
  /** True when the tutor received `[INTERVENE]`; false when only this panel explains. */
  tutorNotified: boolean;
  /** Opens the expert's screen moment; null when the map has no capture session to replay. */
  onReplay: (() => void) | null;
  /** Saves the suggested route through the desk (and the guard) again. */
  onChoose?: ((outcome: Outcome) => void) | null;
  /** The desk is checking or has saved; the route button waits. */
  busy?: boolean;
}

/**
 * The demo's key moment, anchored under DeskSim's "Paused by Singoda AI" notice: the question, the
 * guardrail that held the save, the expert's verbatim words with their timestamp and clip, and
 * the route the expert takes. Calm and decisive: a guard edge and words, never a red wall.
 */
export function InterventionPanel({
  intervention,
  expertName,
  resolvedOutcome,
  tutorNotified,
  onReplay,
  onChoose = null,
  busy = false,
}: InterventionPanelProps) {
  const { payload, cited, primary, moment } = intervention;
  const others = cited.found.filter((g) => g.id !== primary?.id);
  const resolved = resolvedOutcome !== null;
  const expected = payload.expectedOutcome;
  const ruleId = primary?.id ?? payload.ruleIds[0] ?? null;
  const ref = useRef<HTMLElement>(null);

  // Bring the held save into view once, without moving focus away from the learner's control.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, []);

  return (
    <section ref={ref} aria-label="Singoda AI intervention" className="scroll-mt-16 scroll-mb-4">
      <div className="px-4 pt-4 pb-4 @3xl:px-5">
        <div className="flex items-start gap-3">
          <Avatar name="Singoda AI" shadow size="md" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            {resolved ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-ok">
                <CircleCheck aria-hidden="true" className="size-3.5 stroke-[2]" />
                Resolved on <span className="font-mono">{payload.ticketId}</span>
              </p>
            ) : null}
            <h3 className="text-lg leading-7 font-semibold text-balance text-ink">
              {expertName} would stop here. Why do you think?
            </h3>
            {!resolved ? (
              <p className="mt-0.5 text-ui text-ink-muted">
                {tutorNotified
                  ? "Singoda AI is asking you out loud. Answer, then pick the next action."
                  : "Coaching on screen · voice optional. Think it through, then pick the next action."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 min-w-0 @3xl:pl-11">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="guard" className="font-mono">
              {ruleId ? `Guardrail ${ruleId}` : "Guardrail"}
            </Badge>
            {primary ? <GuardrailTypeBadge type={primary.type} /> : null}
          </div>
          {primary ? (
            <>
              <p className="mt-2 text-sm text-ink">
                <span className="font-medium">When {primary.condition}</span>
                <span className="text-ink-muted"> → {primary.action}</span>
              </p>
              <figure className="mt-3">
                <blockquote className="max-w-[68ch] border-l-2 border-rule-strong pl-3.5 text-lg leading-relaxed text-pretty text-ink">
                  “{primary.evidence.quote.text}”
                </blockquote>
                <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-3.5 text-xs text-ink-muted">
                  <span className="font-medium text-ink">{expertName}</span>
                  <time
                    className="figures font-mono"
                    dateTime={`PT${Math.floor(primary.evidence.quote.tMs / 1000)}S`}
                  >
                    {formatMs(primary.evidence.quote.tMs)}
                  </time>
                  <span>{SOURCE_LABEL[primary.evidence.quote.source]}</span>
                  {onReplay ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onReplay}
                      icon={<Play aria-hidden="true" className="fill-current" />}
                      className="ml-auto"
                      trailing={
                        moment ? (
                          <span className="figures ml-1 font-mono text-xs text-ink-faint">
                            {formatClip(moment.clip)}
                          </span>
                        ) : undefined
                      }
                    >
                      Play {expertName}'s clip
                    </Button>
                  ) : (
                    <span className="ml-auto">{NO_REPLAY_NOTE}</span>
                  )}
                </figcaption>
              </figure>
            </>
          ) : (
            <p className="mt-2 max-w-prose text-sm text-ink">
              Paused by rule <span className="font-mono">{ruleId ?? "(none cited)"}</span>. It is
              not in the published Work Map, so there are no words from {expertName} to quote for
              it.
            </p>
          )}
          {others.length > 0 ? <AlsoApplies guardrails={others} /> : null}
        </div>
      </div>

      <div
        className={cx(
          "flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 @3xl:px-5",
          resolved ? "border-ok/25 bg-ok-wash" : "border-rule bg-sunken",
        )}
      >
        <dl className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-ui @3xl:pl-11">
          <div className="flex items-center gap-2">
            <dt className="text-ink-muted">You chose</dt>
            <dd>
              <Badge tone="guard" className="line-through decoration-guard-text/60">
                {ACTION_LABELS[payload.attemptedOutcome]}
              </Badge>
            </dd>
          </div>
          {expected ? (
            <div className="flex items-center gap-2">
              <dt className="text-ink-muted">{expertName}'s route</dt>
              <dd>
                <Badge tone="neutral">{ACTION_LABELS[expected]}</Badge>
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 @2xl:ml-auto">
          {resolved ? (
            <p className="flex items-center gap-1.5 text-ui font-medium text-ok">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
              Saved as {ACTION_LABELS[resolvedOutcome]}
              {expected === resolvedOutcome ? `, the route ${expertName} takes.` : "."}
            </p>
          ) : expected && onChoose ? (
            <>
              <span className="text-xs text-ink-faint">or pick any action below</span>
              <Button
                size="md"
                disabled={busy}
                onClick={() => onChoose(expected)}
                icon={<ArrowRight aria-hidden="true" />}
                trailing={
                  <Kbd
                    aria-hidden="true"
                    className="ml-1 h-4 min-w-4 border-ink-inverse/40! bg-transparent! text-[10px] text-ink-inverse! shadow-none!"
                  >
                    {shortcutFor(expected)}
                  </Kbd>
                }
              >
                Take {expertName}'s route
              </Button>
            </>
          ) : (
            <p className="text-xs text-ink-faint">Pick another action below to continue.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function AlsoApplies({ guardrails }: { guardrails: Guardrail[] }) {
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <p className="text-xs font-medium text-ink-muted">Also applies</p>
      <ul className="mt-1.5 flex flex-col gap-2">
        {guardrails.map((g) => (
          <li key={g.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-ui">
            <span className="font-mono text-xs text-ink-faint">{g.id}</span>
            <span className="text-ink">
              {g.condition}
              <span className="text-ink-muted"> → {g.action}</span>
            </span>
            <span className="w-full pl-0 text-xs text-ink-muted @3xl:w-auto">
              “{g.evidence.quote.text}”
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
