"use client";

import { useConversationControls } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import { RecordingBar, type RecordingState, RecordingStatus } from "@/components/recording";
import { micLevel } from "./helpers";

/** Re-renders every `ms` while `active`, returning `read()`; the caller stays still. */
function useTicking(read: () => number, active: boolean, ms: number): number {
  const readRef = useRef(read);
  readRef.current = read;
  const [value, setValue] = useState(() => read());
  useEffect(() => {
    setValue(readRef.current());
    if (!active) return;
    const id = setInterval(() => setValue(readRef.current()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return value;
}

/**
 * The input level the voice session is hearing, read from the ElevenLabs SDK's own analyser
 * (`getInputVolume`) ten times a second. Zero unless `active`; no second microphone stream.
 */
function useMicLevel(active: boolean): number {
  const { getInputVolume } = useConversationControls();
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    const id = setInterval(() => {
      let volume = 0;
      try {
        volume = getInputVolume();
      } catch {
        volume = 0;
      }
      setLevel((prev) => micLevel(volume, prev));
    }, 100);
    return () => clearInterval(id);
  }, [active, getInputVolume]);
  return level;
}

export interface LiveRecordingBarProps {
  state: RecordingState;
  /** Recorded time so far (session time minus pauses). */
  elapsed: () => number;
  /** True while a voice session is connected, so the SDK has a microphone level to read. */
  voiceConnected: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onToggleOffRecord: () => void;
  className?: string;
}

/** The recording kit's bar, fed with a ticking timer and the live microphone level. */
export function LiveRecordingBar({
  state,
  elapsed,
  voiceConnected,
  className,
  ...handlers
}: LiveRecordingBarProps) {
  const live = state === "recording";
  const ms = useTicking(elapsed, state !== "idle", 250);
  const level = useMicLevel(live && voiceConnected);
  return (
    <RecordingBar
      state={state}
      elapsedMs={ms}
      level={level}
      offRecordShortcut={["Alt", "O"]}
      className={className}
      {...handlers}
    />
  );
}

/** The compact top-bar pill, with its own one-second tick. */
export function LiveRecordingStatus({
  state,
  elapsed,
}: {
  state: RecordingState;
  elapsed: () => number;
}) {
  const ms = useTicking(elapsed, state === "recording", 500);
  return <RecordingStatus state={state} elapsedMs={ms} />;
}
