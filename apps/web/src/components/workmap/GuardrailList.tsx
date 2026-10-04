"use client";

import type { Guardrail, Step } from "@shadow/schema";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cx } from "../ui";
import { ClipPlayer } from "./ClipPlayer";
import { formatClip, GUARDRAIL_TYPE_LABEL, GUARDRAIL_TYPES } from "./format";
import {
  Button,
  GUARDRAIL_EDGE,
  GuardrailTypeBadge,
  InlineConfirm,
  QuoteBlock,
  SectionTitle,
} from "./primitives";

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
    <section aria-labelledby="guardrails-heading" className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
        <div className="lg:col-span-6">
          <h2
            id="guardrails-heading"
            className="font-display text-[2rem] leading-[1.1] font-normal tracking-[-0.015em] text-ink sm:text-[2.5rem]"
          >
            Guardrails{" "}
            <span className="font-mono text-base tracking-normal text-ink-faint">
              ({guardrails.length})
            </span>
          </h2>
          <p className="mt-3 max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-muted">
            The limits, exceptions and hard stops the expert works by. Each one carries the sentence
            it came from and the screen moment it was said about.
          </p>
        </div>
        <fieldset className="flex flex-wrap gap-2 lg:col-span-6 lg:justify-end">
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
        <p className="text-[0.9375rem] text-ink-muted">
          {guardrails.length === 0
            ? "No guardrails were captured in this session."
            : `No ${GUARDRAIL_TYPE_LABEL[filter as Guardrail["type"]].toLowerCase()} guardrails in this map.`}
        </p>
      ) : (
        <ul aria-label="Guardrail list" className="flex flex-col gap-3">
          {visible.map((g) => {
            const expanded = expandedId === g.id;
            const usedBy = steps.filter((s) => s.guardrailIds.includes(g.id));
            return (
              <li
                key={g.id}
                data-guardrail-id={g.id}
                className="relative overflow-hidden rounded-panel border border-rule bg-surface"
              >
                <span
                  aria-hidden="true"
                  className={cx("absolute inset-y-0 left-0 w-0.5", GUARDRAIL_EDGE[g.type])}
                />
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : g.id)}
                  className="grid w-full grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 py-4 pr-4 pl-5 text-left transition-colors duration-150 hover:bg-sunken/50 sm:grid-cols-[9.5rem_1fr_auto]"
                >
                  <span className="col-start-1 row-start-1 flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1.5">
                    <GuardrailTypeBadge type={g.type} />
                    <span className="font-mono text-xs text-ink-faint">{g.id}</span>
                  </span>
                  <span className="col-span-2 row-start-2 min-w-0 text-[0.9375rem] leading-relaxed sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    <span className="block font-medium text-ink">{g.condition}</span>
                    <span className="mt-0.5 block text-ink-muted">{g.action}</span>
                  </span>
                  <span className="col-start-2 row-start-1 inline-flex min-h-10 items-center gap-1.5 self-start text-sm text-ink-muted sm:col-start-3">
                    {expanded ? "Hide" : "Evidence"}
                    <ChevronDown
                      aria-hidden="true"
                      className={cx(
                        "size-4 transition-transform duration-150",
                        expanded && "rotate-180",
                      )}
                    />
                  </span>
                </button>

                {expanded && (
                  <div className="grid gap-6 border-t border-rule py-5 pr-4 pl-5 sm:grid-cols-[9.5rem_1fr] sm:gap-x-4">
                    <div className="hidden sm:block">
                      <SectionTitle>Evidence</SectionTitle>
                    </div>
                    <div className="flex min-w-0 flex-col gap-5">
                      <QuoteBlock quote={g.evidence.quote} size="md" />
                      {sessionId ? (
                        <ClipPlayer moment={g.evidence.moment} sessionId={sessionId} />
                      ) : (
                        <p className="font-mono text-xs text-ink-faint">
                          Clip {formatClip(g.evidence.moment.clip)}, frame{" "}
                          {g.evidence.moment.frameId}
                        </p>
                      )}
                      {g.machineRule && (
                        <p className="text-sm leading-relaxed text-ink-muted">
                          Machine rule:{" "}
                          <span className="font-mono text-[0.8125rem] text-ink">
                            {g.machineRule.effect.replace("_", " ").toLowerCase()}
                          </span>
                          {g.machineRule.expectedOutcome ? (
                            <>
                              , expected outcome{" "}
                              <span className="font-mono text-[0.8125rem] text-ink">
                                {g.machineRule.expectedOutcome.replaceAll("_", " ")}
                              </span>
                            </>
                          ) : null}
                          . Paraphrases are covered by the judge.
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
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
                                className="inline-flex min-h-10 items-center rounded-control border border-rule-strong px-3 text-sm text-ink transition-colors duration-150 hover:border-ink"
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
                          <div>
                            <Button
                              tone="danger"
                              onClick={() => setConfirmingId(g.id)}
                              disabled={busy}
                            >
                              Remove guardrail
                            </Button>
                          </div>
                        ))}
                    </div>
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
