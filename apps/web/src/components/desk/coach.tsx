"use client";

import type { Outcome } from "@shadow/schema";
import { createContext, type ReactNode, useContext } from "react";

/** What DeskSim lends to coaching UI it renders next to the action bar. */
export interface DeskCoachApi {
  /** Runs the outcome through the same path as its action button (preSave included). */
  choose: (outcome: Outcome) => void;
  /** True while a save is being checked or once the ticket is saved; `choose` then does nothing. */
  busy: boolean;
}

/**
 * Optional render function a host page provides around DeskSim to anchor coaching (Teach's
 * intervention and prediction prompts) beside the open ticket's action bar. It lives in context,
 * not in DeskSimProps, so the DeskSim contract (types.ts) stays as it is; hosts that don't
 * provide it (Capture, the desk preview) render nothing extra.
 */
export type DeskCoachRender = (ticketId: string, api: DeskCoachApi) => ReactNode;

const DeskCoachContext = createContext<DeskCoachRender | null>(null);

export const DeskCoachProvider = DeskCoachContext.Provider;

export function useDeskCoach(): DeskCoachRender | null {
  return useContext(DeskCoachContext);
}
