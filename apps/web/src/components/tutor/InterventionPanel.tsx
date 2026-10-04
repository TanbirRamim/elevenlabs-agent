"use client";

import type { Guardrail, Outcome } from "@shadow/schema";
import { Play } from "lucide-react";
import { ACTION_LABELS } from "@/components/desk/ActionBar";
import { Badge, Button, cx } from "@/components/ui";
import { GuardrailTypeBadge, QuoteBlock } from "@/components/workmap/primitives";
import type { Intervention } from "./logic";

export interface InterventionPanelProps {
  intervention: Intervention;
  expertName: string;
  /** The outcome the learner saved on this ticket after the pause, once it went through. */
  resolvedOutcome: Outcome | null;
  /** True when the tutor received `[INTERVENE]`; false when only this panel explains. */
  tutorNotified: boolean;
  onReplay: (() => void) | null;
}

/**
 * Shown when the guard paused a save: the cited guardrail, the expert's words, and a replay.
 * The demo's key moment, so it is set large and calm: a signal edge, never a red wall.
 */
export function InterventionPanel({
  intervention,
  expertName,
  resolvedOutcome,
  tutorNotified,
  onReplay,
}: InterventionPanelProps) {
  const { payload, cited, primary } = intervention;
  const others = cited.found.filter((g) => g.id !== primary?.id);
  const resolved = resolvedOutcome !== null;
  return (
    <section
      aria-label="Shadow intervention"
      className={cx(
        "relative overflow-hidden rounded-panel border bg-surface shadow-raised",
        resolved ? "border-ok/50" : "border-rule-strong",
      )}
    >
      <span
        aria-hidden="true"
        className={cx("absolute inset-y-0 left-0 w-1", resolved ? "bg-ok" : "bg-guard")}
      />
      <div className="px-5 pt-5 pb-6 sm:px-8 sm:pt-6 sm:pb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
          <Badge tone={resolved ? "ok" : "guard"} dot>
            {resolved ? "Resolved" : "Guardrail"}
          </Badge>
          <span>
            Ticket <span className="font-mono text-[0.8125rem] text-ink">{payload.ticketId}</span>,{" "}
            {ACTION_LABELS[payload.attemptedOutcome]} paused before save
          </span>
        </div>

        <h2 className="mt-4 max-w-[24ch] text-lg leading-tight font-semibold text-balance text-ink">
          {expertName} would stop here. Why do you think?
        </h2>

        {primary ? (
          <GuardrailQuote guardrail={primary} expertName={expertName} prominent />
        ) : (
          <p className="mt-5 max-w-[42rem] text-[0.9375rem] leading-relaxed text-ink">
            Paused by rule{" "}
            <span className="font-mono text-[0.8125rem]">
              {payload.ruleIds[0] ?? "(none cited)"}
            </span>
            . It is not in the published Work Map, so there are no words from {expertName} to quote
            for it.
          </p>
        )}

        {others.length > 0 && (
          <div className="mt-6 border-t border-rule pt-4">
            <p className="text-sm font-medium text-ink-muted">Also applies</p>
            {others.map((g) => (
              <GuardrailQuote key={g.id} guardrail={g} expertName={expertName} />
            ))}
          </div>
        )}

        <dl className="mt-6 grid gap-4 border-t border-rule pt-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <dt className="text-sm text-ink-muted">You chose</dt>
            <dd>
              <Badge tone="danger">{ACTION_LABELS[payload.attemptedOutcome]}</Badge>
            </dd>
          </div>
          {payload.expectedOutcome && (
            <div className="flex flex-col gap-1.5">
              <dt className="text-sm text-ink-muted">Expected route</dt>
              <dd>
                <Badge tone="ok">{ACTION_LABELS[payload.expectedOutcome]}</Badge>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          {onReplay && (
            <Button onClick={onReplay}>
              <Play aria-hidden="true" />
              Replay {expertName}'s moment
            </Button>
          )}
          {!tutorNotified && (
            <span className="text-sm text-ink-muted">
              Voice tutor not connected: the explanation is on screen only.
            </span>
          )}
        </div>

        {resolved && (
          <p className="mt-5 text-[0.9375rem] font-medium text-ok">
            Saved as {ACTION_LABELS[resolvedOutcome]}
            {payload.expectedOutcome === resolvedOutcome ? ", the route the expert takes." : "."}
          </p>
        )}
      </div>
    </section>
  );
}

function GuardrailQuote({
  guardrail,
  expertName,
  prominent = false,
}: {
  guardrail: Guardrail;
  expertName: string;
  prominent?: boolean;
}) {
  return (
    <div className={prominent ? "mt-6" : "mt-3"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <GuardrailTypeBadge type={guardrail.type} />
        <span className="font-mono text-xs text-ink-faint">{guardrail.id}</span>
      </div>
      <p className="mt-2 max-w-[48rem] text-[0.9375rem] leading-relaxed">
        <span className="font-medium text-ink">{guardrail.condition}</span>
        <span className="text-ink-muted">: {guardrail.action}</span>
      </p>
      <div className={prominent ? "mt-4" : "mt-2"}>
        <QuoteBlock
          quote={guardrail.evidence.quote}
          size={prominent ? "lg" : "sm"}
          speakerName={expertName}
        />
      </div>
    </div>
  );
}
