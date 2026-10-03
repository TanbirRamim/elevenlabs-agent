"use client";

import { useState } from "react";
import { useVoice, type VoiceAgent, VoiceProvider } from "@/lib/voice";

/**
 * Voice check: talk to an agent without the rest of the app. Used to verify the ElevenLabs
 * setup (TAN-0) and the control protocol (hidden [ASK] messages must not appear below).
 */
export default function VoiceCheckPage() {
  return (
    <VoiceProvider>
      <VoiceCheck />
    </VoiceProvider>
  );
}

function VoiceCheck() {
  const [agent, setAgent] = useState<VoiceAgent>("interviewer");
  const voice = useVoice({
    agent,
    dynamicVariables: { expert_name: "Maya", learner_name: "Jonas" },
  });
  const live = voice.status === "connected";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Voice check</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Starts a conversation with one agent. Control messages are hidden from the transcript by
        design.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
          value={agent}
          disabled={live}
          onChange={(e) => setAgent(e.target.value as VoiceAgent)}
        >
          <option value="interviewer">Interviewer</option>
          <option value="tutor">Tutor</option>
        </select>
        {live ? (
          <button
            type="button"
            className="rounded-md bg-neutral-900 px-3 py-1 text-white dark:bg-white dark:text-black"
            onClick={voice.stop}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="rounded-md bg-neutral-900 px-3 py-1 text-white dark:bg-white dark:text-black"
            disabled={voice.status === "connecting"}
            onClick={() => void voice.start()}
          >
            {voice.status === "connecting" ? "Connecting…" : "Start"}
          </button>
        )}
        <StatusChip status={voice.status} mode={voice.mode} />
      </div>

      {voice.error && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {voice.error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
          disabled={!live}
          onClick={() => voice.sendScreen("ticket T3 opened; tag chargeback-open visible")}
        >
          Send screen context
        </button>
        <button
          type="button"
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
          disabled={!live}
          onClick={() =>
            voice.sendControl("[ASK]", "You held the refund on T3 instead of paying it. Why?")
          }
        >
          Send [ASK]
        </button>
        <button
          type="button"
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
          disabled={!live}
          onClick={voice.markActivity}
        >
          Mark activity
        </button>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-500">
          Transcript · last user speech{" "}
          {voice.lastUserSpeechMs === null
            ? "–"
            : `${(voice.lastUserSpeechMs / 1000).toFixed(1)} s`}
        </h2>
        <ol className="mt-2 space-y-2">
          {voice.transcript.map((line) => (
            <li key={line.id} className="text-sm">
              <span className="mr-2 font-mono text-xs text-neutral-400">
                {(line.tMs / 1000).toFixed(1)}s
              </span>
              <span className={line.role === "agent" ? "text-sky-700 dark:text-sky-300" : ""}>
                {line.role === "agent" ? "Shadow" : "You"}:
              </span>{" "}
              {line.text}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function StatusChip({ status, mode }: { status: string; mode: string }) {
  const label =
    status === "connected" ? (mode === "speaking" ? "Shadow is speaking" : "Listening") : status;
  return (
    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
      {label}
    </span>
  );
}
