"use client";

import type { Guardrail, Step } from "@shadow/schema";
import { useState } from "react";
import { cx } from "../ui";
import { ClipPlayer } from "./ClipPlayer";
import { formatClip, formatMs } from "./format";
import { frameUrl } from "./load";
import {
  Button,
  GUARDRAIL_EDGE,
  GuardrailTypeBadge,
  InlineConfirm,
  JudgmentBadge,
  QuoteBlock,
  SectionTitle,
} from "./primitives";

function FrameImage({
  frameId,
  tMs,
  available,
}: {
  frameId: string;
  tMs: number;
  available: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = available && !failed;
  return (
    <figure className="overflow-hidden rounded-panel border border-rule bg-sunken">
      <div className="relative aspect-video w-full">
        {showImage ? (
          // biome-ignore lint/performance/noImgElement: frames come from the API host; next/image would need remotePatterns in next.config.ts, which this page does not own
          <img
            key={frameId}
            src={frameUrl(frameId)}
            alt={`Redacted screen at ${formatMs(tMs)}`}
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
            <span className="font-mono text-xs text-ink-faint">Redacted frame {frameId}</span>
            <span className="max-w-[34ch] text-sm leading-relaxed text-ink-muted">
              {available
                ? "The frame could not be loaded from the API."
                : "Frames exist only for real sessions; this is sample data."}
            </span>
          </div>
        )}
      </div>
      <figcaption className="flex items-baseline justify-between gap-4 border-t border-rule px-3 py-2 text-xs text-ink-muted">
        <span>Screen at this moment</span>
        <span className="font-mono text-ink-faint tabular-nums">{formatMs(tMs)}</span>
      </figcaption>
    </figure>
  );
}

export function StepDetail({
  step,
  guardrails,
  sessionId,
  framesAvailable,
  canEdit,
  busy,
  onRemove,
}: {
  step: Step;
  guardrails: Guardrail[];
  sessionId: string | null;
  framesAvailable: boolean;
  canEdit: boolean;
  busy: boolean;
  onRemove: (stepId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const linked = step.guardrailIds
    .map((id) => guardrails.find((g) => g.id === id))
    .filter((g): g is Guardrail => g !== undefined);

  return (
    <article aria-label={`Step ${step.order}: ${step.title}`} className="flex flex-col gap-8">
      <header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-mono text-xs text-ink-faint">Step {step.order}</span>
          {step.judgmentCall && <JudgmentBadge />}
        </div>
        <h2 className="mt-3 text-base leading-tight font-semibold text-balance text-ink">
          {step.title}
        </h2>
        <p className="mt-4 max-w-[42rem] border-l border-rule-strong pl-4 text-[1.0625rem] leading-relaxed text-ink-muted">
          <span className="sr-only">Decision: </span>
          <span className="text-ink">{step.decision}</span>
        </p>
      </header>

      <section>
        <SectionTitle>Why, in the expert's words</SectionTitle>
        <div className="mt-3">
          <QuoteBlock quote={step.reason} size="lg" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <SectionTitle>The screen moment</SectionTitle>
          <span className="font-mono text-xs text-ink-faint">
            frame {step.moment.frameId} at <time>{formatMs(step.moment.tMs)}</time>
          </span>
        </div>
        <FrameImage
          frameId={step.moment.frameId}
          tMs={step.moment.tMs}
          available={framesAvailable}
        />
        {sessionId ? (
          <ClipPlayer moment={step.moment} sessionId={sessionId} />
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">
            Clip <span className="font-mono text-ink">{formatClip(step.moment.clip)}</span>. Replay
            needs the session recording; open this map with{" "}
            <code className="rounded-[0.25rem] bg-sunken px-1 font-mono text-[0.8125rem] text-ink">
              ?session=&lt;id&gt;
            </code>{" "}
            to play it here.
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Guardrails at this step</SectionTitle>
        {linked.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] text-ink-muted">
            None. A plain step with no rule attached.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {linked.map((g) => (
              <li
                key={g.id}
                className="relative overflow-hidden rounded-panel border border-rule bg-canvas py-4 pr-4 pl-5"
                aria-label={`Guardrail ${g.id}`}
              >
                <span
                  aria-hidden="true"
                  className={cx("absolute inset-y-0 left-0 w-0.5", GUARDRAIL_EDGE[g.type])}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <GuardrailTypeBadge type={g.type} />
                  <span className="font-mono text-xs text-ink-faint">{g.id}</span>
                </div>
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed">
                  <span className="font-medium text-ink">{g.condition}</span>
                  <span className="text-ink-muted">: {g.action}</span>
                </p>
                <div className="mt-3 border-t border-rule pt-3">
                  <QuoteBlock quote={g.evidence.quote} compact />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <footer className="border-t border-rule pt-5">
          {confirming ? (
            <InlineConfirm
              message={`Remove step ${step.order} “${step.title}” from the map?`}
              confirmLabel="Remove step"
              busy={busy}
              onConfirm={async () => {
                await onRemove(step.id);
                setConfirming(false);
              }}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <Button tone="danger" onClick={() => setConfirming(true)} disabled={busy}>
              Remove step
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
