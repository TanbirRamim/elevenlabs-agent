import type { DeskEvent, GuardVerdict, PendingAction, PublicTicket } from "@shadow/schema";

/**
 * The boundary between DeskSim (owner: Harshit) and the pages that host it (owner: Tanbir).
 * DeskSim is a pure UI component: no network calls, no WebSocket, no ElevenLabs.
 * Everything it needs comes in through these props; everything it does goes out through them.
 * Changing this file needs both owners' approval (same rule as packages/schema).
 */
export interface DeskSimProps {
  /** Tickets to show, already fetched by the host page. */
  tickets: PublicTicket[];
  mode: "capture" | "teach";
  /** Milliseconds since session start. DeskSim stamps every event with it. */
  clock: () => number;
  /** Every DOM interaction: ticket_opened, field_changed, action_committed, input_activity (throttled 500 ms). */
  onDeskEvent: (event: DeskEvent) => void;
  /**
   * Called before any action is committed. DeskSim shows "Checking…" while pending.
   * ALLOW / WARN / REQUIRE_APPROVAL commit (REQUIRE_APPROVAL shows an approval note);
   * BLOCK keeps the action uncommitted and shows "Paused by Shadow"; the learner can then pick
   * another action, which goes through preSave again. The host sees every verdict because it
   * implements preSave, so it can start the tutor's intervention from there.
   */
  preSave: (action: PendingAction) => Promise<GuardVerdict>;
}

/** Element id of DeskSim's root. The capture page crops screen frames to this element. */
export const DESK_ROOT_ID = "desksim-root";

/** Attribute on elements that show personal data. The capture page blurs them before snapshotting. */
export const PII_ATTR = "data-pii";
