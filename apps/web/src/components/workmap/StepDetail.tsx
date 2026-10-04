"use client";

import type { Guardrail, Step } from "@shadow/schema";
import { useState } from "react";
import { ClipPlayer } from "./ClipPlayer";
import { formatClip, formatMs } from "./format";
import { frameUrl } from "./load";
import {
  Button,
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
    <div className="relative aspect-video w-full overflow-hidden rounded border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900">
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
        <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center text-sm text-neutral-500">
          <span className="font-medium">Redacted frame {frameId}</span>
          <span>
            {available
              ? "The frame could not be loaded from the API."
              : "Frames exist only for real sessions; this is sample data."}
          </span>
        </div>
      )}
      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs tabular-nums text-white">
        {formatMs(tMs)}
      </span>
    </div>
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
    <article aria-label={`Step ${step.order}: ${step.title}`} className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>Step {step.order}</span>
          <span aria-hidden="true">·</span>
          <time>{formatMs(step.moment.tMs)}</time>
          {step.judgmentCall && <JudgmentBadge />}
        </div>
        <h2 className="mt-1 text-xl font-semibold">{step.title}</h2>
      </header>

      <FrameImage frameId={step.moment.frameId} tMs={step.moment.tMs} available={framesAvailable} />

      <section>
        <SectionTitle>Decision</SectionTitle>
        <p className="mt-1">{step.decision}</p>
      </section>

      <section>
        <SectionTitle>Why, in the expert's words</SectionTitle>
        <QuoteBlock quote={step.reason} />
      </section>

      <section>
        <SectionTitle>Clip</SectionTitle>
        {sessionId ? (
          <div className="mt-2">
            <ClipPlayer moment={step.moment} sessionId={sessionId} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">
            Moment {formatClip(step.moment.clip)}. Replay needs the session recording; open this map
            with{" "}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              ?session=&lt;id&gt;
            </code>{" "}
            to play it here.
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Guardrails at this step</SectionTitle>
        {linked.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">None. A plain step with no rule attached.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {linked.map((g) => (
              <li
                key={g.id}
                className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
                aria-label={`Guardrail ${g.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <GuardrailTypeBadge type={g.type} />
                  <span className="text-sm">
                    <span className="font-medium">{g.condition}</span>
                    <span className="text-neutral-500"> → </span>
                    {g.action}
                  </span>
                </div>
                <div className="mt-2">
                  <QuoteBlock quote={g.evidence.quote} compact />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <footer className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
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
