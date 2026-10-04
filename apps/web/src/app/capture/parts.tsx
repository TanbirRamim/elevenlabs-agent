"use client";

import {
  AppWindow,
  ChevronDown,
  CircleDot,
  GraduationCap,
  Headset,
  House,
  Mic,
  Monitor,
  PanelTop,
  PlayCircle,
  ScreenShare,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
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
  /** `thisTab` is false for a window, a whole screen or another tab: nothing is kept then. */
  | { kind: "sharing"; detail: string; thisTab: boolean }
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
      ? screen.thisTab
        ? { id: "screen", label: "Screen share", status: "ok", detail: screen.detail }
        : {
            id: "screen",
            label: "Screen share",
            status: "pending",
            detail: screen.detail,
            action: shareButton("Share this tab instead"),
          }
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
  onShareOther,
  disabled,
  busy,
  intent,
  voiceMissing,
  redactionFailed,
}: {
  onStart: () => void;
  /** Opens the browser's full picker (a window, a whole screen, another tab). */
  onShareOther: () => void;
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
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-ink [&_svg]:size-[18px] [&_svg]:stroke-[1.75]"
        >
          <ScreenShare />
        </span>
        <div className="min-w-0">
          <h2 id="start-title" className="text-sm font-semibold text-ink">
            Share your screen with Singoda AI
          </h2>
          <p className="mt-0.5 text-ui text-pretty text-ink-muted">
            Like presenting in a call. Singoda AI asks at most {DEFAULT_GATE.maxPer10Min} short
            questions per 10 minutes, and only at a pause.
          </p>
        </div>
      </div>
      <ul aria-label="What you can share" className="flex flex-col gap-1.5">
        <SurfaceRow
          icon={<PanelTop />}
          title="This tab"
          tag="Recommended"
          text="Only the DeskSim area is kept, with personal data blacked out in your browser before anything leaves it."
        />
        <SurfaceRow
          icon={<AppWindow />}
          title="A window or another tab"
          text="Allowed, but Singoda AI cannot locate personal data there, so it keeps nothing until you share this tab."
        />
        <SurfaceRow
          icon={<Monitor />}
          title="Your entire screen"
          text="Same as a window: shown in the picker, nothing is kept."
        />
      </ul>
      <Button
        id={START_BUTTON_ID}
        size="lg"
        onClick={onStart}
        disabled={disabled}
        loading={busy}
        icon={<ScreenShare />}
        className="w-full"
      >
        Start session
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Button size="sm" variant="ghost" onClick={onShareOther} disabled={disabled}>
          Choose a window or screen
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-ink-faint">
          Off the record <KbdCombo keys={["Alt", "O"]} />
        </span>
      </div>
      <p className="text-xs text-pretty text-ink-faint">
        Start shares this tab, then counts down 3 seconds. Skip with <Kbd>Enter</Kbd>.
      </p>
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

function SurfaceRow({
  icon,
  title,
  tag,
  text,
}: {
  icon: ReactNode;
  title: string;
  tag?: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-control border border-rule bg-canvas px-2.5 py-2">
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-ink-muted [&_svg]:size-4 [&_svg]:stroke-[1.75]"
      >
        {icon}
      </span>
      <p className="min-w-0 text-xs text-ink-muted">
        <span className="font-medium text-ink">{title}</span>
        {tag ? (
          <span className="ml-1.5 rounded-full bg-ok-wash px-1.5 py-px text-2xs font-medium text-ok">
            {tag}
          </span>
        ) : null}
        <span className="mt-0.5 block text-pretty">{text}</span>
      </p>
    </li>
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

/** Where the compact Singoda AI menu goes. Kept in sync with the shell's product nav. */
const SINGODA_MENU = [
  { href: "/", match: null, label: "Home", icon: House },
  { href: "/capture", match: "/capture", label: "Capture", icon: CircleDot },
  { href: "/map/latest", match: "/map", label: "Work Maps", icon: Workflow },
  { href: "/teach", match: "/teach", label: "Teach", icon: GraduationCap },
  { href: "/copilot", match: "/copilot", label: "Copilot", icon: Headset },
  { href: "/demo", match: "/demo", label: "Replay", icon: PlayCircle },
] as const;

/**
 * The way back to the website from the standalone app routes: the Singoda AI mark and name
 * link home, the chevron opens a compact menu of the product. Capture intercepts these links
 * while recording and asks before leaving.
 */
export function SingodaNav({
  placement = "down",
  align = "start",
  showName = true,
  className,
}: {
  /** `up` when the nav sits at the bottom of the screen (the docks). */
  placement?: "up" | "down";
  /** `end` when the nav sits at the right edge, so the menu opens leftwards. */
  align?: "start" | "end";
  showName?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav
      ref={root}
      aria-label="Singoda AI"
      className={cx("relative flex shrink-0 items-center", className)}
    >
      <Link
        href="/"
        aria-label="Singoda AI home"
        className="inline-flex h-8 items-center gap-1.5 rounded-control px-1.5 text-ink hover:bg-hover"
      >
        <BrandMark className="size-[18px]" />
        {showName ? (
          <span className="text-ui font-semibold tracking-[-0.01em] whitespace-nowrap">
            Singoda AI
          </span>
        ) : null}
      </Link>
      <button
        ref={toggle}
        type="button"
        aria-label="Singoda AI menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-7 items-center justify-center rounded-control text-ink-muted hover:bg-hover hover:text-ink"
      >
        <ChevronDown
          aria-hidden="true"
          className={cx(
            "size-3.5 stroke-[1.75] transition-transform duration-150",
            open !== (placement === "up") && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <ul
          id={menuId}
          className={cx(
            "absolute z-[70] w-48 rounded-overlay border border-rule bg-surface p-1 shadow-overlay motion-safe:animate-fade-in",
            placement === "up" ? "bottom-full mb-2" : "top-full mt-1",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {SINGODA_MENU.map((item) => {
            const Icon = item.icon;
            const current =
              item.match === null ? pathname === "/" : (pathname?.startsWith(item.match) ?? false);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "flex h-8 items-center gap-2 rounded-control px-2 text-ui text-ink hover:bg-hover",
                    current && "bg-selected font-medium",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 stroke-[1.75] text-ink-muted" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
