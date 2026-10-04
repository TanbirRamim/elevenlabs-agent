"use client";

import { AudioLines, Captions, Flag, PauseCircle, PhoneOff, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ListeningIndicator, type ListeningState } from "@/components/recording";
import { TutorVoicePanel, type TutorVoicePanelProps } from "@/components/tutor/TutorVoicePanel";
import { Avatar, Button, IconButton, Tooltip } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { formatMs } from "@/components/workmap/format";

/**
 * Singoda AI's entire presence while the learner works the standalone DeskSim app: a Meet-style
 * dock floating over the bottom of the screen, the teach twin of CapturePill. It carries the
 * tutor's voice state, the mic, the session timer, how many saves Singoda AI held, and Finish.
 * Singoda AI's prompts (predict at a judgment point) surface as a callout above the dock; a held
 * save is explained beside the held action itself, inside the app.
 */
export interface TeachDockProps {
  learnerName: string | null;
  /** Epoch ms the session started; null until it has. */
  since: number | null;
  saved: number;
  total: number;
  held: number;
  voiceState: ListeningState;
  voice: Omit<TutorVoicePanelProps, "expertName">;
  expertName: string;
  onFinish: () => void;
  finishing: boolean;
  /** Singoda AI's current prompt (the predict callout), shown above the dock. */
  callout?: ReactNode;
  /** Floating notices (guard warnings, load problems) stacked above everything. */
  notice?: ReactNode;
}

export function TeachDock({
  learnerName,
  since,
  saved,
  total,
  held,
  voiceState,
  voice,
  expertName,
  onFinish,
  finishing,
  callout,
  notice,
}: TeachDockProps) {
  const [peek, setPeek] = useState(false);
  const live = voice.status === "connected" || voice.status === "connecting";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {notice ? (
        <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2">{notice}</div>
      ) : null}

      {callout ? (
        <div className="pointer-events-auto max-h-[45dvh] w-full max-w-xl overflow-y-auto rounded-overlay border border-ask/40 bg-surface shadow-overlay motion-safe:animate-fade-in">
          {callout}
        </div>
      ) : null}

      {peek ? (
        <section
          aria-label="Voice tutor"
          className="pointer-events-auto relative w-full max-w-md motion-safe:animate-fade-in"
        >
          <div className="absolute top-2 right-2 z-10">
            <IconButton size="sm" label="Close tutor transcript" onClick={() => setPeek(false)}>
              <X />
            </IconButton>
          </div>
          <div className="max-h-[50dvh] overflow-y-auto rounded-overlay shadow-overlay">
            <TutorVoicePanel {...voice} expertName={expertName} />
          </div>
        </section>
      ) : null}

      <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-2 rounded-overlay border border-rule bg-surface/95 p-2 shadow-overlay backdrop-blur sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-1">
          <Avatar name="Singoda AI" shadow size="sm" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-ui font-semibold text-ink">
              Singoda AI <span className="font-normal text-ink-muted">· tutor</span>
            </p>
            <p className="figures truncate text-2xs text-ink-faint">
              {learnerName ?? "New hire"} · <DockClock since={since} />
            </p>
          </div>
        </div>

        <dl className="flex items-center gap-1.5 text-xs">
          <DockStat label="Saved" value={`${saved}/${total}`} />
          <DockStat
            label="Held by Singoda AI"
            value={String(held)}
            icon={<PauseCircle aria-hidden="true" className="size-3.5 stroke-[1.75]" />}
            tone={held > 0 ? "guard" : "muted"}
          />
        </dl>

        <span aria-hidden="true" className="hidden h-6 w-px bg-rule sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="hidden text-2xs whitespace-nowrap text-ink-faint md:inline">
            Voice by ElevenLabs Agents
          </span>
          <ListeningIndicator state={voiceState} compact />
          <Tooltip
            content={live ? "Stop the voice tutor" : "Talk to the voice tutor (ElevenLabs Agents)"}
          >
            <IconButton
              size="sm"
              label={live ? "Stop voice tutor" : "Start voice tutor"}
              aria-pressed={live}
              onClick={live ? voice.onStop : voice.onStart}
              className={cx(live && "bg-guard-wash text-guard-text")}
            >
              {live ? <PhoneOff /> : <AudioLines />}
            </IconButton>
          </Tooltip>
          <Tooltip content="Tutor transcript">
            <IconButton
              size="sm"
              label="Tutor transcript"
              aria-pressed={peek}
              onClick={() => setPeek((open) => !open)}
            >
              <Captions />
            </IconButton>
          </Tooltip>
          <Button
            size="sm"
            variant="secondary"
            icon={<Flag aria-hidden="true" />}
            onClick={onFinish}
            loading={finishing}
          >
            Finish session
          </Button>
        </div>
      </div>
    </div>
  );
}

function DockStat({
  label,
  value,
  icon,
  tone = "muted",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "muted" | "guard";
}) {
  return (
    <div
      className={cx(
        "inline-flex h-7 items-center gap-1 rounded-control border px-2",
        tone === "guard"
          ? "border-guard/40 bg-guard-wash text-guard-text"
          : "border-rule bg-sunken text-ink-muted",
      )}
    >
      {icon}
      <dt className="sr-only">{label}</dt>
      <dd className="figures font-medium">
        {value}
        <span aria-hidden="true" className="ml-1 font-normal opacity-80">
          {label === "Saved" ? "saved" : "held"}
        </span>
      </dd>
    </div>
  );
}

/** Elapsed session time, ticking once a second. */
function DockClock({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="font-mono" title="Session time">
      <span className="sr-only">Session time </span>
      {formatMs(since === null ? 0 : now - since)}
    </time>
  );
}
