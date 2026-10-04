"use client";

import type { Guardrail, Step } from "@shadow/schema";
import { useState } from "react";
import { ClipPlayer } from "./ClipPlayer";
import { formatClip, GUARDRAIL_TYPE_LABEL, GUARDRAIL_TYPES } from "./format";
import { Button, GuardrailTypeBadge, InlineConfirm, QuoteBlock } from "./primitives";

export type GuardrailFilter = "all" | Guardrail["type"];

export function GuardrailList({
  guardrails,
  steps,
  sessionId,
  canEdit,
  busy,
  onRemove,
  onOpenStep,
}: {
  guardrails: Guardrail[];
  steps: Step[];
  sessionId: string | null;
  canEdit: boolean;
  busy: boolean;
  onRemove: (guardrailId: string) => Promise<void>;
  onOpenStep: (stepId: string) => void;
}) {
  const [filter, setFilter] = useState<GuardrailFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const visible = filter === "all" ? guardrails : guardrails.filter((g) => g.type === filter);
  const countFor = (type: Guardrail["type"]) => guardrails.filter((g) => g.type === type).length;

  return (
    <section aria-labelledby="guardrails-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="guardrails-heading" className="text-lg font-semibold">
          Guardrails{" "}
          <span className="text-sm font-normal text-neutral-500">({guardrails.length})</span>
        </h2>
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">Filter guardrails by type</legend>
          <Button onClick={() => setFilter("all")} pressed={filter === "all"}>
            All
          </Button>
          {GUARDRAIL_TYPES.map((type) => (
            <Button key={type} onClick={() => setFilter(type)} pressed={filter === type}>
              {GUARDRAIL_TYPE_LABEL[type]} ({countFor(type)})
            </Button>
          ))}
        </fieldset>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {guardrails.length === 0
            ? "No guardrails were captured in this session."
            : `No ${GUARDRAIL_TYPE_LABEL[filter as Guardrail["type"]].toLowerCase()} guardrails in this map.`}
        </p>
      ) : (
        <ul
          aria-label="Guardrail list"
          className="divide-y divide-neutral-200 dark:divide-neutral-800"
        >
          {visible.map((g) => {
            const expanded = expandedId === g.id;
            const usedBy = steps.filter((s) => s.guardrailIds.includes(g.id));
            return (
              <li key={g.id} className="py-3" data-guardrail-id={g.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : g.id)}
                  className="flex w-full flex-wrap items-start gap-2 text-left"
                >
                  <GuardrailTypeBadge type={g.type} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{g.condition}</span>
                    <span className="text-neutral-500"> → </span>
                    {g.action}
                  </span>
                  <span className="text-xs text-neutral-500">{expanded ? "Hide" : "Evidence"}</span>
                </button>

                {expanded && (
                  <div className="mt-3 space-y-3 pl-1">
                    <QuoteBlock quote={g.evidence.quote} compact />
                    {sessionId ? (
                      <ClipPlayer moment={g.evidence.moment} sessionId={sessionId} />
                    ) : (
                      <p className="text-xs text-neutral-500">
                        Moment {formatClip(g.evidence.moment.clip)} · frame{" "}
                        {g.evidence.moment.frameId}
                      </p>
                    )}
                    {g.machineRule && (
                      <p className="text-xs text-neutral-500">
                        Machine rule: {g.machineRule.effect.replace("_", " ").toLowerCase()}
                        {g.machineRule.expectedOutcome
                          ? `, expected outcome ${g.machineRule.expectedOutcome.replaceAll("_", " ")}`
                          : ""}
                        . Paraphrases are covered by the judge.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {usedBy.length === 0 ? (
                        <span>Not attached to a step.</span>
                      ) : (
                        <>
                          <span>Applied at</span>
                          {usedBy.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => onOpenStep(s.id)}
                              className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                            >
                              step {s.order}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    {canEdit &&
                      (confirmingId === g.id ? (
                        <InlineConfirm
                          message={`Remove guardrail “${g.condition}”? Steps that cite it keep their quote.`}
                          confirmLabel="Remove guardrail"
                          busy={busy}
                          onConfirm={async () => {
                            await onRemove(g.id);
                            setConfirmingId(null);
                          }}
                          onCancel={() => setConfirmingId(null)}
                        />
                      ) : (
                        <Button tone="danger" onClick={() => setConfirmingId(g.id)} disabled={busy}>
                          Remove guardrail
                        </Button>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
