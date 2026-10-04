import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  CircleDot,
  GraduationCap,
  Headset,
  Inbox,
  PlayCircle,
  Workflow,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  /** Path prefix that marks this item current. */
  match: string;
  icon: LucideIcon;
  /** Second key of the "G then <key>" go-to shortcut. */
  goKey?: string;
  description: string;
};

/** Product navigation, in workflow order. */
export const PRODUCT_NAV: readonly NavItem[] = [
  {
    id: "capture",
    label: "Capture",
    href: "/capture",
    match: "/capture",
    icon: CircleDot,
    goKey: "c",
    description: "Record an expert triaging tickets",
  },
  {
    id: "maps",
    label: "Work Maps",
    href: "/map/latest",
    match: "/map",
    icon: Workflow,
    goKey: "m",
    description: "Steps, reasons and guardrails from a capture",
  },
  {
    id: "teach",
    label: "Teach",
    href: "/teach",
    match: "/teach",
    icon: GraduationCap,
    goKey: "t",
    description: "Coach a new hire on unseen tickets",
  },
  {
    id: "copilot",
    label: "Copilot",
    href: "/copilot",
    match: "/copilot",
    icon: Headset,
    goKey: "p",
    description: "Guidance while working live tickets",
  },
];

/** Tools for setup and review; quieter, below the product nav. */
export const TOOLS_NAV: readonly NavItem[] = [
  {
    id: "demo",
    label: "Demo replay",
    href: "/demo",
    match: "/demo",
    icon: PlayCircle,
    description: "The whole story in 90 seconds",
  },
  {
    id: "desk",
    label: "Desk preview",
    href: "/desk",
    match: "/desk",
    icon: Inbox,
    description: "The sandbox helpdesk on its own",
  },
  {
    id: "voice-check",
    label: "Voice check",
    href: "/voice-check",
    match: "/voice-check",
    icon: AudioLines,
    description: "Test the voice agents",
  },
];

export const ALL_NAV: readonly NavItem[] = [...PRODUCT_NAV, ...TOOLS_NAV];

/** Routes rendered without the app shell (marketing and the full-screen replay). */
const BARE_ROUTES: readonly string[] = ["/", "/demo"];

/**
 * Routes with no Shadow chrome at all: the capture page plays a standalone ticketing
 * product that owns the whole viewport, with Shadow present only as the floating pill.
 */
const NAKED_ROUTES: readonly string[] = ["/capture"];

export function isBareRoute(pathname: string): boolean {
  return BARE_ROUTES.includes(normalize(pathname));
}

export function isNakedRoute(pathname: string): boolean {
  return NAKED_ROUTES.includes(normalize(pathname));
}

function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

export function isCurrent(item: NavItem, pathname: string): boolean {
  const p = normalize(pathname);
  return p === item.match || p.startsWith(`${item.match}/`);
}

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV.find((item) => isCurrent(item, pathname));
}

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb for the top bar: section, then the record when the URL names one.
 * `/map/latest` → Work Maps / Latest; `/map/abc123` → Work Maps / abc123.
 */
export function resolveCrumbs(pathname: string): Crumb[] {
  const p = normalize(pathname);
  const item = findNavItem(p);
  if (!item) return [{ label: "Shadow" }];
  const rest = p.slice(item.match.length).split("/").filter(Boolean);
  if (rest.length === 0) return [{ label: item.label }];
  const record = decodeURIComponent(rest[0] ?? "");
  return [
    { label: item.label, href: item.href },
    { label: record === "latest" ? "Latest" : record },
  ];
}
