"use client";

import type { Guardrail, Step } from "@shadow/schema";
import { ChevronRight, Cpu, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, cx, EmptyState, Panel, SegmentedControl, type SegmentedOption } from "../ui";
import { ClipPlayer } from "./ClipPlayer";
import { formatClip, GUARDRAIL_TYPE_LABEL, GUARDRAIL_TYPES } from "./format";
import { GUARDRAIL_EDGE, GuardrailTypeBadge, InlineConfirm, QuoteBlock } from "./primitives";

export type GuardrailFilter = "all" | Guardrail["type"];

const EFFECT_LABEL = {
  BLOCK: "Blocks the action",
  REQUIRE_APPROVAL: "Needs a second approval",
  WARN: "Warns",
} as const;

/** The map's rules as a filterable list; each row opens its evidence (quote, clip, steps). */
export function GuardrailList({
  guardrails,
  steps,
  sessionId,
  expertName,
  canEdit,
  busy,
  onRemove,
  onOpenStep,
}: {
  guardrails: Guardrail[];
  steps: Step[];
  sessionId: string | null;
  expertName?: string;
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

  const options: SegmentedOption<GuardrailFilter>[] = [
    {
      value: "all",
      ariaLabel: "All",
      label: (
        <>
          All <Count n={guardrails.length} />
        </>
      ),
    },
    ...GUARDRAIL_TYPES.map((type) => ({
      value: type,
      ariaLabel: `${GUARDRAIL_TYPE_LABEL[type]} (${countFor(type)})`,
      disabled: countFor(type) === 0,
      label: (
        <>
          {GUARDRAIL_TYPE_LABEL[type]} <Count n={countFor(type)} />
        </>
      ),
    })),
  ];

  return (
    <Panel
      id="guardrails"
      title="Guardrails"
      meta={
        <>
          <span className="figures">{guardrails.length}</span>
          <span className="hidden sm:inline"> rules, each with the sentence it came from</span>
        </>
      }
      flush
    >
      <div className="overflow-x-auto border-b border-rule px-3 py-2">
        <SegmentedControl
          label="Filter guardrails by type"
          size="sm"
          options={options}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {visible.length === 0 ? (
        <div className="px-4">
          <EmptyState
            icon={<ShieldCheck />}
            title={
              guardrails.length === 0
                ? "No guardrails were captured"
                : `No ${GUARDRAIL_TYPE_LABEL[filter as Guardrail["type"]].toLowerCase()} rules`
            }
            description={
              guardrails.length === 0
                ? "The expert named no limits or hard stops in this session. The debrief asks for them."
                : "Pick another type to see its rules."
            }
          />
        </div>
      ) : (
        <ul aria-label="Guardrail list" className="divide-y divide-rule">
          {visible.map((g) => {
            const expanded = expandedId === g.id;
            const usedBy = steps.filter((s) => s.guardrailIds.includes(g.id));
            const panelId = `guardrail-${g.id}-evidence`;
            return (
              <li key={g.id} data-guardrail-id={g.id} className="relative">
                <span
                  aria-hidden="true"
                  className={cx("absolute inset-y-0 left-0 w-0.5", GUARDRAIL_EDGE[g.type])}
                />
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setExpandedId(expanded ? null : g.id)}
                  className={cx(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 py-3 pr-3 pl-4 text-left transition-colors duration-100 focus-visible:-outline-offset-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-center",
                    expanded ? "bg-sunken" : "hover:bg-hover",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <GuardrailTypeBadge type={g.type} />
                    <span className="font-mono text-xs text-ink-faint">{g.id}</span>
                  </span>
                  <span className="col-span-2 row-start-2 min-w-0 text-ui sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    <span className="block font-medium text-ink">{g.condition}</span>
                    <span className="block text-ink-muted">{g.action}</span>
                  </span>
                  <span className="col-start-2 row-start-1 inline-flex items-center gap-2 text-xs text-ink-faint sm:col-start-3">
                    <span className="hidden md:inline">
                      {usedBy.length === 0
                        ? "No step"
                        : `Step ${usedBy.map((s) => s.order).join(", ")}`}
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className={cx(
                        "size-4 stroke-[1.75] transition-transform duration-150",
                        expanded && "rotate-90",
                      )}
                    />
                  </span>
                </button>

                {expanded && (
                  <div
                    id={panelId}
                    className="grid gap-4 border-t border-rule bg-sunken px-4 pt-3 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <div className="flex min-w-0 flex-col gap-3">
                      <QuoteBlock quote={g.evidence.quote} size="md" speakerName={expertName} />
                      {g.machineRule ? (
                        <p className="flex items-start gap-2 text-xs text-ink-muted">
                          <Cpu
                            aria-hidden="true"
                            className="mt-0.5 size-3.5 shrink-0 stroke-[1.75]"
                          />
                          <span>
                            Machine rule:{" "}
                            <span className="font-medium text-ink">
                              {EFFECT_LABEL[g.machineRule.effect]}
                            </span>
                            {g.machineRule.expectedOutcome ? (
                              <>
                                , routes to{" "}
                                <span className="font-mono text-ink">
                                  {g.machineRule.expectedOutcome.replaceAll("_", " ")}
                                </span>
                              </>
                            ) : null}
                            . Paraphrases are covered by the judge.
                          </span>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        {usedBy.length === 0 ? (
                          <span>Not attached to a step.</span>
                        ) : (
                          <>
                            <span>Applied at</span>
                            {usedBy.map((s) => (
                              <Button
                                key={s.id}
                                size="sm"
                                variant="secondary"
                                onClick={() => onOpenStep(s.id)}
                              >
                                Step {s.order}
                              </Button>
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
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 aria-hidden="true" />}
                              onClick={() => setConfirmingId(g.id)}
                              disabled={busy}
                              className="text-danger hover:bg-danger-wash hover:text-danger"
                            >
                              Remove guardrail
                            </Button>
                          </div>
                        ))}
                    </div>
                    <div className="min-w-0">
                      {sessionId ? (
                        <ClipPlayer
                          moment={g.evidence.moment}
                          sessionId={sessionId}
                          quoteMs={g.evidence.quote.tMs}
                        />
                      ) : (
                        <p className="text-xs text-ink-faint">
                          Clip{" "}
                          <span className="figures font-mono">
                            {formatClip(g.evidence.moment.clip)}
                          </span>
                          , frame <span className="font-mono">{g.evidence.moment.frameId}</span>. It
                          plays here when the map has a session recording.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Count({ n }: { n: number }) {
  return <span className="figures text-ink-faint">{n}</span>;
}
