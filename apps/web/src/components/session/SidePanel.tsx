"use client";

import type { VoiceLine, VoiceStatus } from "@/lib/voice";

export interface SidePanelProps {
  status: VoiceStatus;
  mode: "speaking" | "listening";
  offRecord: boolean;
  questionsAsked: number;
  questionBudget: number;
  transcript: VoiceLine[];
  error: string | null;
  onToggleOffRecord: () => void;
}

/** The expert-facing panel: what Shadow is doing, what was said, and the off-the-record control. */
export function SidePanel(props: SidePanelProps) {
  const {
    status,
    mode,
    offRecord,
    questionsAsked,
    questionBudget,
    transcript,
    error,
    onToggleOffRecord,
  } = props;
  const state = agentState(status, mode, offRecord);

  return (
    <aside className="flex h-full flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>
          {state.label}
        </span>
        <span className="text-xs text-neutral-500">
          Questions {questionsAsked}/{questionBudget}
        </span>
      </div>

      {offRecord && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Off the record. Nothing is captured or stored until you resume.
        </p>
      )}

      <button
        type="button"
        onClick={onToggleOffRecord}
        aria-pressed={offRecord}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
      >
        {offRecord ? "Back on the record" : "Go off the record"}{" "}
        <kbd className="ml-1 text-xs text-neutral-500">Alt+O</kbd>
      </button>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <section className="min-h-0 flex-1 overflow-y-auto">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Conversation
        </h2>
        {transcript.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Work as you normally would and think aloud. Shadow only asks at natural pauses.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {transcript.map((line) => (
              <li key={line.id} className="text-sm leading-snug">
                <span
                  className={
                    line.role === "agent"
                      ? "font-medium text-sky-700 dark:text-sky-300"
                      : "font-medium"
                  }
                >
                  {line.role === "agent" ? "Shadow" : "You"}
                </span>{" "}
                {line.text}
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

function agentState(status: VoiceStatus, mode: "speaking" | "listening", offRecord: boolean) {
  if (status === "error")
    return {
      label: "Voice error",
      className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    };
  if (status === "connecting")
    return {
      label: "Connecting…",
      className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
    };
  if (status !== "connected")
    return {
      label: "Not started",
      className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
    };
  if (offRecord)
    return {
      label: "Off the record",
      className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    };
  if (mode === "speaking")
    return {
      label: "Asking",
      className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
    };
  return {
    label: "Listening quietly",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  };
}
