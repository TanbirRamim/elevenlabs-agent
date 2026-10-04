"use client";

import { Mic, MicOff } from "lucide-react";
import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useRef } from "react";
import { ListeningIndicator, type ListeningState } from "@/components/recording";
import { Alert, Avatar, Button } from "@/components/ui";
import { OrbFallback } from "@/components/voice/OrbFallback";
import type { OrbState } from "@/components/voice/orbState";
import { formatMs } from "@/components/workmap/format";
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
  expertName?: string;
}

/** The orb shows what the voice session is really doing; nothing is animated without a session. */
export function orbStateFor(status: VoiceStatus, mode: "speaking" | "listening"): OrbState {
  if (status !== "connected") return "idle";
  return mode === "speaking" ? "speaking" : "listening";
}

/** The tutor's voice state in the recording kit's words (top bar and this panel). */
export function listeningStateFor(
  status: VoiceStatus,
  mode: "speaking" | "listening",
): ListeningState {
  if (status === "connected") return mode === "speaking" ? "asking" : "listening";
  if (status === "connecting") return "quiet";
  return "off";
}

const DETAIL: Record<VoiceStatus, string> = {
  disconnected: "Start the tutor to talk it through. Saves are checked either way.",
  connecting: "Connecting to the voice tutor…",
  connected: "Speak any time. Shadow speaks up at judgment points and before a risky save.",
  error: "The voice tutor stopped. Saves are still checked and coaching shows on screen.",
};

/** The learner-facing voice rail: tutor state, start/stop and the live transcript. */
export function TutorVoicePanel({
  status,
  mode,
  error,
  transcript,
  onStart,
  onStop,
  expertName = "the expert",
}: TutorVoicePanelProps) {
  const live = status === "connected";
  const notConfigured = error !== null && /not configured/i.test(error);
  const listRef = useRef<HTMLOListElement>(null);
  const lineCount = transcript.length;

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    const el = listRef.current;
    if (el && lineCount > 0) el.scrollTop = el.scrollHeight;
  }, [lineCount]);

  return (
    <aside
      aria-label="Voice tutor"
      className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface"
    >
      <header className="flex h-11 items-center justify-between gap-2 border-b border-rule px-4">
        <h2 className="text-ui font-semibold text-ink">Voice tutor</h2>
        <ListeningIndicator state={listeningStateFor(status, mode)} />
      </header>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="relative size-14 shrink-0">
            <VoiceOrb state={orbStateFor(status, mode)} />
          </div>
          <p aria-live="polite" className="text-ui text-ink-muted">
            {DETAIL[status]}
          </p>
        </div>
        {live ? (
          <Button
            variant="secondary"
            onClick={onStop}
            icon={<MicOff aria-hidden="true" />}
            className="w-full"
          >
            Stop voice
          </Button>
        ) : (
          <Button
            onClick={onStart}
            loading={status === "connecting"}
            icon={<Mic aria-hidden="true" />}
            className="w-full"
          >
            Start voice tutor
          </Button>
        )}
        {error ? (
          notConfigured ? (
            <Alert tone="info" title="Voice isn't configured">
              Set <code className="font-mono text-xs">ELEVENLABS_TUTOR_AGENT_ID</code> in{" "}
              <code className="font-mono text-xs">.env</code> and restart. Teach works without it:
              every save is still checked and the coaching shows on screen.
            </Alert>
          ) : (
            <Alert tone="danger" title="Voice unavailable">
              {error}
            </Alert>
          )
        ) : null}
      </div>
      <section aria-labelledby="tutor-transcript" className="border-t border-rule">
        <h2
          id="tutor-transcript"
          className="flex h-9 items-center justify-between px-4 text-xs font-medium text-ink-muted"
        >
          Conversation
          {lineCount > 0 ? <span className="figures text-ink-faint">{lineCount}</span> : null}
        </h2>
        {lineCount === 0 ? (
          <ol className="flex flex-col gap-2.5 px-4 pb-4 text-ui text-ink-muted">
            <HowItWorks n={1}>Open a ticket and work it as you normally would.</HowItWorks>
            <HowItWorks n={2}>At a judgment point, Shadow asks what you would do.</HowItWorks>
            <HowItWorks n={3}>
              Before a risky save, Shadow holds it and shows {expertName}'s own words.
            </HowItWorks>
          </ol>
        ) : (
          <ol
            ref={listRef}
            aria-live="polite"
            className="flex max-h-[26rem] flex-col gap-3 overflow-y-auto px-4 pb-4"
          >
            {transcript.map((line) => (
              <li key={line.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
                <span className="figures pt-0.5 font-mono text-2xs text-ink-faint">
                  {formatMs(line.tMs)}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    {line.role === "agent" ? (
                      <>
                        <Avatar name="Shadow" shadow size="xs" />
                        <span className="text-ask-text">Shadow</span>
                      </>
                    ) : (
                      <span className="text-ink-muted">You</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-ui leading-5 text-pretty text-ink">{line.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

function HowItWorks({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2">
      <span className="figures inline-flex size-5 items-center justify-center rounded-full border border-rule text-2xs text-ink-faint">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
