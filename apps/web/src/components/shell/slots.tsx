"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShell } from "./ShellContext";

/**
 * Page actions in the top bar, right side (e.g. "Publish", "Share"). Render it anywhere in a
 * page under the AppShell. Outside the shell it renders inline so the page still works.
 */
export function TopBarActions({ children }: { children: ReactNode }) {
  const shell = useShell();
  if (!shell) return <>{children}</>;
  if (!shell.actionsNode) return null;
  return createPortal(children, shell.actionsNode);
}

/**
 * The live session status slot, left of the actions (e.g. a RecordingStatus or
 * ListeningIndicator). Only one page should fill it at a time.
 */
export function TopBarStatus({ children }: { children: ReactNode }) {
  const shell = useShell();
  if (!shell) return <>{children}</>;
  if (!shell.statusNode) return null;
  return createPortal(children, shell.statusNode);
}
