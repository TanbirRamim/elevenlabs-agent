"use client";

import dynamic from "next/dynamic";
import { Button, cx } from "@/components/ui";
import { OrbFallback } from "@/components/voice/OrbFallback";
import type { OrbState } from "@/components/voice/orbState";
import type { VoiceLine, VoiceStatus } from "@/lib/voice";

const VoiceOrb = dynamic(() => import("@/components/voice/VoiceOrb"), {
  ssr: false,
  loading: () => <OrbFallback state="idle" />,
});

export interface TutorVoicePanelProps {
  status: VoiceStatus;
  mode: "speaking" | "listening";
  error: string | null;
  transcript: VoiceLine[];
  onStart: () => void;
  onStop: () => void;
}

const LABEL: Record<VoiceStatus, string> = {
  disconnected: "Tutor not started",
  connecting: "Connecting…",
  connected: "Tutor listening",
  error: "Voice error",
};

/** The orb shows what the voice session is really doing; nothing is animated without a session. */
export function orbStateFor(status: VoiceStatus, mode: "speaking" | "listening"): OrbState {
  if (status !== "connected") return "idle";
  return mode === "speaking" ? "speaking" : "listening";
}

/** The learner-facing voice panel: tutor state, start/stop and the visible conversation. */
export function TutorVoicePanel({
  status,
  mode,
  error,
  transcript,
  onStart,
  onStop,
}: TutorVoicePanelProps) {
  const speaking = status === "connected" && mode === "speaking";
  const label = speaking ? "Tutor speaking" : LABEL[status];
  const orb = orbStateFor(status, mode);
  const live = status === "connected";
  return (
    <aside
      aria-label="Voice tutor"
      className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <div className="flex flex-col items-center gap-4 px-5 pt-6 pb-5">
        <div className="relative size-36">
          <VoiceOrb state={orb} />
        </div>
        <p
          aria-live="polite"
          className={cx(
            "inline-flex items-center gap-2 font-mono text-[0.8125rem]",
            live ? "text-signal-text" : status === "error" ? "text-stop" : "text-ink-muted",
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              "size-1.5 rounded-full",
              live ? "bg-signal" : status === "error" ? "bg-stop" : "bg-ink-faint",
            )}
          />
          {label}
        </p>
        {live ? (
          <Button variant="secondary" size="sm" onClick={onStop} className="w-full">
            Stop voice
          </Button>
        ) : (
          <Button size="sm" onClick={onStart} disabled={status === "connecting"} className="w-full">
            Start voice tutor
          </Button>
        )}
        {error && (
          <p className="w-full rounded-control border border-stop/40 bg-stop-wash px-3 py-2 text-sm text-stop">
            {error}
          </p>
        )}
      </div>
      <section className="max-h-80 overflow-y-auto border-t border-rule bg-sunken/50 px-5 py-4">
        <h2 className="text-sm font-medium text-ink-muted">Conversation</h2>
        {transcript.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Work the tickets. Shadow speaks up at judgment points and before a risky save.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {transcript.map((line) => (
              <li key={line.id} className="text-[0.9375rem] leading-snug text-ink">
                <span
                  className={cx(
                    "mr-1.5 font-mono text-xs",
                    line.role === "agent" ? "text-signal-text" : "text-ink-faint",
                  )}
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
