"use client";

import { createContext, useContext } from "react";

export type ShellApi = {
  openPalette: () => void;
  openShortcuts: () => void;
  toggleSidebar: () => void;
  /** DOM nodes in the top bar that page content portals into (see slots.tsx). */
  actionsNode: HTMLElement | null;
  statusNode: HTMLElement | null;
};

export const ShellContext = createContext<ShellApi | null>(null);

/** The shell API, or null when rendered outside the AppShell (landing, demo, tests). */
export function useShell(): ShellApi | null {
  return useContext(ShellContext);
}
