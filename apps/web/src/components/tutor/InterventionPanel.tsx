"use client";

import type { Guardrail, Outcome } from "@shadow/schema";
import { ACTION_LABELS } from "@/components/desk/ActionBar";
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

/** Shown when the guard paused a save: the cited guardrail, the expert's words, and a replay. */
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
      className={`rounded-lg border-2 p-4 ${
        resolved
          ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950"
          : "border-red-700 bg-red-50 dark:bg-red-950"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        Ticket {payload.ticketId} · {ACTION_LABELS[payload.attemptedOutcome]} paused before save
      </p>
      <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        {expertName} would stop here. Why do you think?
      </h2>

      {primary ? (
        <GuardrailQuote guardrail={primary} expertName={expertName} />
      ) : (
        <p className="mt-3 text-sm text-neutral-800 dark:text-neutral-100">
          Paused by rule {payload.ruleIds[0] ?? "(none cited)"}. It is not in the published Work
          Map, so there are no words from {expertName} to quote for it.
        </p>
      )}

      {others.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
            Also applies
          </p>
          {others.map((g) => (
            <GuardrailQuote key={g.id} guardrail={g} expertName={expertName} />
          ))}
        </div>
      )}

      {payload.expectedOutcome && (
        <p className="mt-3 text-sm text-neutral-800 dark:text-neutral-100">
          Expected route: <strong>{ACTION_LABELS[payload.expectedOutcome]}</strong>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onReplay && (
          <button
            type="button"
            onClick={onReplay}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Replay {expertName}'s moment
          </button>
        )}
        {!tutorNotified && (
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            Voice tutor not connected: the explanation is on screen only.
          </span>
        )}
      </div>

      {resolved && (
        <p className="mt-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">
          Saved as {ACTION_LABELS[resolvedOutcome]}
          {payload.expectedOutcome === resolvedOutcome ? ", the route the expert takes." : "."}
        </p>
      )}
    </section>
  );
}

function GuardrailQuote({ guardrail, expertName }: { guardrail: Guardrail; expertName: string }) {
  return (
    <div className="mt-2">
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        {guardrail.id} · {guardrail.condition} → {guardrail.action}
      </p>
      <blockquote className="mt-1 border-l-4 border-neutral-400 pl-3 text-sm italic text-neutral-800 dark:text-neutral-200">
        “{guardrail.evidence.quote.text}”{" "}
        <span className="not-italic text-neutral-500">— {expertName}</span>
      </blockquote>
    </div>
  );
}
