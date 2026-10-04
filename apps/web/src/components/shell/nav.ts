import type { LucideIcon } from "lucide-react";
import { CircleDot, GraduationCap, Headset, PlayCircle, Workflow } from "lucide-react";

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

/**
 * Secondary entries, quieter, below the product nav. Setup and diagnostic routes (/desk,
 * /voice-check) stay reachable by URL for tests but are deliberately not linked here or in ⌘K.
 */
export const TOOLS_NAV: readonly NavItem[] = [
  {
    id: "demo",
    label: "Demo replay",
    href: "/demo",
    match: "/demo",
    icon: PlayCircle,
    description: "The whole story in 90 seconds",
  },
];

export const ALL_NAV: readonly NavItem[] = [...PRODUCT_NAV, ...TOOLS_NAV];

/** Routes rendered without the app shell (marketing and the full-screen replay). */
const BARE_ROUTES: readonly string[] = ["/", "/demo"];

/**
 * Routes with no Singoda AI chrome at all: capture and teach play a standalone ticketing product
 * that owns the whole viewport, with Singoda AI present only as a floating dock.
 */
const NAKED_ROUTES: readonly string[] = ["/capture", "/teach"];

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
  if (!item) return [{ label: "Singoda AI" }];
  const rest = p.slice(item.match.length).split("/").filter(Boolean);
  if (rest.length === 0) return [{ label: item.label }];
  const record = decodeURIComponent(rest[0] ?? "");
  return [
    { label: item.label, href: item.href },
    { label: record === "latest" ? "Latest" : record },
  ];
}
