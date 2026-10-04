"use client";

import type { VoiceLine, VoiceStatus } from "@/lib/voice";

export interface TutorVoicePanelProps {
  status: VoiceStatus;
  mode: "speaking" | "listening";
  error: string | null;
  transcript: VoiceLine[];
  onStart: () => void;
  onStop: () => void;
}

const STATE: Record<VoiceStatus, { label: string; className: string }> = {
  disconnected: {
    label: "Tutor not started",
    className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
  },
  connecting: {
    label: "Connecting…",
    className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
  },
  connected: {
    label: "Tutor listening",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  error: {
    label: "Voice error",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  },
};

/** The learner-facing voice panel: tutor state, start/stop and the visible conversation. */
export function TutorVoicePanel({
  status,
  mode,
  error,
  transcript,
  onStart,
  onStop,
}: TutorVoicePanelProps) {
  const state =
    status === "connected" && mode === "speaking"
      ? {
          label: "Tutor speaking",
          className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
        }
      : STATE[status];
  return (
    <aside className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.className}`}>
          {state.label}
        </span>
        {status === "connected" ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
          >
            Stop voice
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={status === "connecting"}
            className="rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Start voice tutor
          </button>
        )}
      </div>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <section className="max-h-80 overflow-y-auto">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Conversation
        </h2>
        {transcript.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Work the tickets. Shadow speaks up at judgment points and before a risky save.
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
