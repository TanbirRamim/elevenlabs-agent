"use client";

import type { Guardrail, Step } from "@shadow/schema";
import { ImageOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { Avatar, Button, cx } from "../ui";
import { ClipPlayer } from "./ClipPlayer";
import { formatClip, formatMs, SOURCE_LABEL } from "./format";
import { frameUrl } from "./load";
import { GUARDRAIL_EDGE, GuardrailTypeBadge, InlineConfirm, JudgmentBadge } from "./primitives";

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
    <figure className="overflow-hidden rounded-panel border border-rule bg-surface">
      <div
        className={cx("relative w-full bg-sunken", showImage ? "aspect-video" : "aspect-[16/5]")}
      >
        {showImage ? (
          // biome-ignore lint/performance/noImgElement: frames come from the API host; next/image would need remotePatterns in next.config.ts, which this page does not own
          <img
            key={frameId}
            src={frameUrl(frameId)}
            alt={`Redacted screen at ${formatMs(tMs)}`}
            onError={() => setFailed(true)}
            className="size-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
            <ImageOff aria-hidden="true" className="size-5 stroke-[1.5] text-ink-faint" />
            <span className="text-ui font-medium text-ink">No frame to show</span>
            <span className="max-w-[40ch] text-xs text-ink-muted">
              {available
                ? "The frame could not be loaded from the API."
                : "Frames exist only for recorded sessions; this is sample data."}
            </span>
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-4 border-t border-rule px-3 py-2 text-xs text-ink-muted">
        <span>
          Redacted frame <span className="font-mono text-ink-faint">{frameId}</span>
        </span>
        <span className="figures font-mono text-ink-faint">{formatMs(tMs)}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The evidence card for one step: what was decided, why in the expert's verbatim words (who,
 * when, in what context), the screen moment and its clip, and the rules that apply here.
 */
export function StepDetail({
  step,
  stepCount,
  expertName,
  guardrails,
  sessionId,
  framesAvailable,
  canEdit,
  busy,
  onRemove,
}: {
  step: Step;
  stepCount?: number;
  expertName?: string;
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
  const speaker = step.reason.speaker === "expert" ? (expertName ?? "Expert") : step.reason.speaker;

  return (
    <article aria-label={`Step ${step.order}: ${step.title}`} className="flex flex-col">
      <header className="border-b border-rule px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="figures font-mono text-xs text-ink-faint">
            Step {step.order}
            {stepCount ? ` of ${stepCount}` : ""}
          </span>
          {step.judgmentCall && <JudgmentBadge />}
        </div>
        <h2 className="mt-1.5 text-sm font-semibold text-balance text-ink">{step.title}</h2>
        <dl className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-ui">
          <dt className="text-ink-faint">Decision</dt>
          <dd className="text-ink">{step.decision}</dd>
          <dt className="text-ink-faint">On screen</dt>
          <dd className="text-ink-muted">
            <span className="figures font-mono text-xs">
              <time>{formatMs(step.moment.tMs)}</time>
            </span>
            <span className="text-ink-faint"> · clip </span>
            <span className="figures font-mono text-xs">{formatClip(step.moment.clip)}</span>
          </dd>
        </dl>
      </header>

      <section aria-label="Evidence" className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <figure className="rounded-panel border border-rule bg-sunken p-3.5">
          <figcaption className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <Avatar name={speaker} size="xs" />
            <span className="font-medium text-ink">{speaker}</span>
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
            <time
              className="figures font-mono text-ink"
              dateTime={`PT${Math.floor(step.reason.tMs / 1000)}S`}
            >
              {formatMs(step.reason.tMs)}
            </time>
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
            <span>{SOURCE_LABEL[step.reason.source]}</span>
            <span className="ml-auto font-mono text-2xs text-ink-faint">
              {step.reason.segmentId}
            </span>
          </figcaption>
          <blockquote className="border-l-2 border-rule-strong pl-3 text-base text-pretty text-ink">
            “{step.reason.text}”
          </blockquote>
        </figure>

        {sessionId ? (
          <ClipPlayer moment={step.moment} sessionId={sessionId} quoteMs={step.reason.tMs} />
        ) : (
          <div className="flex flex-col gap-2">
            <FrameImage
              frameId={step.moment.frameId}
              tMs={step.moment.tMs}
              available={framesAvailable}
            />
            <p className="text-xs text-ink-muted">
              Clip <span className="figures font-mono">{formatClip(step.moment.clip)}</span> plays
              here when the map has a session recording (open it with{" "}
              <code className="rounded-[4px] bg-sunken px-1 font-mono text-2xs">
                ?session=&lt;id&gt;
              </code>
              ).
            </p>
          </div>
        )}
      </section>

      <section
        aria-label="Guardrails at this step"
        className="border-t border-rule px-4 py-4 sm:px-5"
      >
        <h3 className="text-xs font-medium text-ink-muted">
          Guardrails at this step{" "}
          <span className="figures font-normal text-ink-faint">{linked.length}</span>
        </h3>
        {linked.length === 0 ? (
          <p className="mt-1.5 text-ui text-ink-faint">None. A plain step with no rule attached.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {linked.map((g) => (
              <li
                key={g.id}
                className="relative overflow-hidden rounded-panel border border-rule py-2.5 pr-3 pl-3.5"
                aria-label={`Guardrail ${g.id}`}
              >
                <span
                  aria-hidden="true"
                  className={cx("absolute inset-y-0 left-0 w-0.5", GUARDRAIL_EDGE[g.type])}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <GuardrailTypeBadge type={g.type} />
                  <span className="font-mono text-xs text-ink-faint">{g.id}</span>
                </div>
                <p className="mt-1.5 text-ui">
                  <span className="font-medium text-ink">{g.condition}</span>
                  <span className="text-ink-muted"> → {g.action}</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  “{g.evidence.quote.text}”{" "}
                  <span className="figures font-mono text-ink-faint">
                    {formatMs(g.evidence.quote.tMs)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <footer className="border-t border-rule bg-sunken px-4 py-2.5 sm:px-5">
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
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 aria-hidden="true" />}
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="text-danger hover:bg-danger-wash hover:text-danger"
            >
              Remove step
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
