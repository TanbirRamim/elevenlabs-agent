"use client";

import { ListeningIndicator, PrivacyIndicator, RecordingStatus } from "../recording";
import { Alert, Avatar } from "../ui";
import { sampleWorkMap } from "../workmap/fixture";
import { formatMs } from "../workmap/format";
import { StepTimeline } from "../workmap/StepTimeline";

/**
 * Crops of the real product UI for the landing page's three steps: the same components the
 * app renders, fed the sample map, inert (they are pictures here, not controls).
 */

const noop = () => {};

export function CaptureCrop() {
  const step = sampleWorkMap.steps.find((s) => s.judgmentCall) ?? sampleWorkMap.steps[0];
  return (
    <div inert className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <RecordingStatus state="recording" elapsedMs={191_000} />
        <ListeningIndicator state="asking" />
        <PrivacyIndicator redaction="active" offRecord={false} />
      </div>
      <div className="rounded-panel border border-rule bg-surface p-3">
        <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-ask-text">
          <Avatar name="Shadow" size="xs" shadow />
          Shadow asks at a pause
        </p>
        <p className="text-ui text-ink">You refunded that one yourself. Where is your limit?</p>
        {step ? (
          <blockquote className="mt-2.5 border-l-2 border-rule-strong pl-3 text-ui text-ink-muted">
            “{step.reason.text}”
            <span className="figures ml-2 font-mono text-2xs text-ink-faint">
              {formatMs(step.reason.tMs)}
            </span>
          </blockquote>
        ) : null}
      </div>
    </div>
  );
}

export function MapCrop() {
  const steps = [...sampleWorkMap.steps].sort((a, b) => a.order - b.order).slice(1, 4);
  return (
    <div inert className="bg-surface">
      <StepTimeline steps={steps} selectedId={steps[1]?.id ?? null} onSelect={noop} />
    </div>
  );
}

export function TeachCrop() {
  const g = sampleWorkMap.guardrails.find((x) => x.type === "never") ?? sampleWorkMap.guardrails[0];
  if (!g) return null;
  return (
    <div inert className="flex flex-col gap-3 p-3">
      <div className="rounded-panel border border-rule bg-surface p-3">
        <p className="text-xs text-ink-faint">
          New hire pressed <span className="font-medium text-ink">Refund</span> on a ticket the
          expert never saw
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {["Reply", "Refund", "Hand off to Billing disputes"].map((a) => (
            <span
              key={a}
              className={
                a === "Refund"
                  ? "inline-flex h-7 items-center rounded-control border border-guard bg-surface px-2.5 text-ui text-ink"
                  : "inline-flex h-7 items-center rounded-control border border-rule-strong bg-surface px-2.5 text-ui text-ink-muted"
              }
            >
              {a}
            </span>
          ))}
        </div>
      </div>
      <Alert tone="guard" title="Paused by Shadow before it was saved">
        Rule <span className="font-mono">{g.id}</span>: {g.condition}. “{g.evidence.quote.text}”
      </Alert>
    </div>
  );
}
