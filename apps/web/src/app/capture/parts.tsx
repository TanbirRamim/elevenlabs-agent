"use client";

import { Mic, ScreenShare } from "lucide-react";
import type { ReactNode } from "react";
import type { PreflightItem } from "@/components/recording";
import { Alert, Button, Kbd, KbdCombo, Skeleton, SkeletonText } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { DEFAULT_GATE } from "@/lib/turnGate";
import type { usePreflight } from "./usePreflight";

/** Presentational pieces of the Capture page. State lives in CaptureSession. */

export const START_BUTTON_ID = "capture-start";

export type ScreenState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "sharing"; detail: string }
  | { kind: "denied" }
  | { kind: "ended" }
  | { kind: "error"; message: string };

export function buildPreflight({
  preflight,
  screen,
  onShare,
}: {
  preflight: ReturnType<typeof usePreflight>;
  screen: ScreenState;
  onShare: () => void;
}): PreflightItem[] {
  const { mic, agent, redaction, requestMic } = preflight;
  const shareButton = (label: string) => (
    <Button size="sm" variant="secondary" icon={<ScreenShare />} onClick={onShare}>
      {label}
    </Button>
  );
  const screenItem: PreflightItem =
    screen.kind === "sharing"
      ? { id: "screen", label: "Screen share", status: "ok", detail: screen.detail }
      : screen.kind === "requesting"
        ? {
            id: "screen",
            label: "Screen share",
            status: "pending",
            detail: "Pick this tab in the browser dialog.",
          }
        : screen.kind === "idle"
          ? {
              id: "screen",
              label: "Screen share",
              status: "pending",
              detail: "Waiting for you to share this tab. Start session asks for it too.",
              action: shareButton("Share this tab"),
            }
          : {
              id: "screen",
              label: "Screen share",
              status: "failed",
              detail:
                screen.kind === "denied"
                  ? "Sharing was cancelled or blocked."
                  : screen.kind === "ended"
                    ? "Sharing stopped."
                    : screen.message,
              fixHint: "Select Share this tab and choose this tab in the browser dialog.",
              action: shareButton("Share again"),
            };
  return [
    {
      id: "mic",
      label: "Microphone",
      status: mic.status,
      detail: mic.detail,
      fixHint: mic.fixHint,
      action: mic.needsAction ? (
        <Button size="sm" variant="secondary" icon={<Mic />} onClick={() => void requestMic()}>
          Allow
        </Button>
      ) : undefined,
    },
    screenItem,
    {
      id: "agent",
      label: "Voice agent",
      status: agent.status,
      detail: agent.detail,
      fixHint: agent.fixHint,
    },
    {
      id: "redaction",
      label: "Redaction",
      status: redaction.status,
      detail: redaction.detail,
      fixHint: redaction.fixHint,
    },
  ];
}

export function StartPanel({
  onStart,
  disabled,
  busy,
  intent,
  voiceMissing,
  redactionFailed,
}: {
  onStart: () => void;
  disabled: boolean;
  busy: boolean;
  intent: boolean;
  voiceMissing: boolean;
  redactionFailed: boolean;
}) {
  return (
    <section
      aria-labelledby="start-title"
      className={cx(
        "flex flex-col gap-3 rounded-panel border bg-surface p-4",
        intent ? "border-ask" : "border-rule",
      )}
    >
      <div>
        <h2 id="start-title" className="text-sm font-semibold text-ink">
          New capture session
        </h2>
        <p className="mt-1 text-ui text-pretty text-ink-muted">
          Singoda AI records only the support desk, with personal data blacked out. It asks at most{" "}
          {DEFAULT_GATE.maxPer10Min} short questions per 10 minutes, and only at a pause.
        </p>
      </div>
      <Button
        id={START_BUTTON_ID}
        size="lg"
        onClick={onStart}
        disabled={disabled}
        loading={busy}
        className="w-full"
      >
        Start session
      </Button>
      <ul className="flex flex-col gap-1 text-xs text-ink-faint">
        <li className="flex items-center gap-1.5">
          3-second countdown, skip with <Kbd>Enter</Kbd>
        </li>
        <li className="flex items-center gap-1.5">
          Off the record any time with <KbdCombo keys={["Alt", "O"]} />
        </li>
      </ul>
      {redactionFailed ? (
        <p className="text-xs text-danger">
          Recording is blocked until redaction works in this browser.
        </p>
      ) : voiceMissing ? (
        <p className="text-xs text-ink-muted">
          Without voice, Singoda AI follows the desk silently and you answer the debrief by typing.
        </p>
      ) : null}
    </section>
  );
}

export function DeskFrame({
  live,
  holding,
  children,
}: {
  live: boolean;
  holding: boolean;
  children: ReactNode;
}) {
  return (
    // DeskSim keeps its own look. The frame marks the captured region and, while nothing is
    // captured, turns dashed so the state reads on the desk itself too.
    <div
      className={cx(
        "flex flex-col gap-2 rounded-panel border p-2 transition-colors duration-200",
        holding ? "border-dashed border-ink-faint bg-surface" : "border-rule bg-sunken",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-xs">
        <span className="font-medium text-ink-muted">
          {live ? (holding ? "Not capturing" : "Captured area") : "Area Singoda AI will capture"}
        </span>
        <span className="text-ink-faint">Personal data is blacked out before upload</span>
      </div>
      {children}
    </div>
  );
}

export function HoldStrip({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-panel border border-rule-strong bg-sunken px-3.5 py-2.5 motion-safe:animate-fade-in sm:flex-row sm:items-center"
    >
      <span
        aria-hidden="true"
        className="hidden shrink-0 text-ink-muted sm:inline-flex [&_svg]:size-4 [&_svg]:stroke-[1.75]"
      >
        {icon}
      </span>
      <p className="min-w-0 flex-1 text-ui text-ink">
        <span className="font-medium">{title}</span> <span className="text-ink-muted">{text}</span>
      </p>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function ShareEndedNotice() {
  return (
    <Alert tone="info" title="Screen sharing ended, so Singoda AI stopped the session">
      Everything up to that moment is kept. The debrief continues below.
    </Alert>
  );
}

export function LoadingWorkspace() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]"
    >
      <span className="sr-only">Loading the tickets and creating the session…</span>
      <div className="rounded-panel border border-rule bg-sunken p-2">
        <div className="grid min-h-96 grid-cols-1 overflow-hidden rounded-panel border border-rule bg-surface md:grid-cols-[16rem_1fr]">
          <div className="flex flex-col gap-3 border-b border-rule p-4 md:border-r md:border-b-0">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
          <div className="p-6">
            <Skeleton className="mb-4 h-5 w-2/5" />
            <SkeletonText lines={4} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-panel border border-rule bg-surface p-4">
        <Skeleton className="h-4 w-1/2" />
        <SkeletonText lines={2} />
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
