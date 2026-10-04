import type { GuardVerdict, PendingAction } from "@shadow/schema";
import { preSave } from "../api";

/**
 * The Shadow connector: the one integration hook a company's tool adds. Before it commits a
 * ticket action (refund, reply, escalation…), the tool calls `shadow.check(action)` and acts on
 * the verdict. Watching a screen can never stop a save; only a pre-commit call can. Capture needs
 * no connector at all (screen share only). See docs/CONNECTOR.md.
 */

/** The server's judge times out at 6 s; this covers that plus the network. */
export const DEFAULT_CHECK_TIMEOUT_MS = 6000;

export interface CheckOptions {
  /** The teach session the save belongs to; the API scores the verdict in its mastery report. */
  sessionId?: string | null;
}

export interface ConnectorVerdict extends GuardVerdict {
  /**
   * Set when Shadow could not answer in time (or its judge timed out) and the save was allowed.
   * Fail-open: the host shows it so nobody believes the save was checked.
   */
  warning?: string;
}

export type CheckTransport = (action: PendingAction, sessionId?: string) => Promise<GuardVerdict>;

export interface ShadowConnector {
  check(action: PendingAction, options?: CheckOptions): Promise<ConnectorVerdict>;
}

export interface ConnectorConfig {
  /** How the verdict is fetched. Default: `POST /guard/presave` on the Shadow API. */
  transport?: CheckTransport;
  timeoutMs?: number;
}

export function createShadowConnector({
  transport = preSave,
  timeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
}: ConnectorConfig = {}): ShadowConnector {
  return {
    async check(action, { sessionId } = {}) {
      let verdict: GuardVerdict;
      try {
        verdict = await withTimeout(transport(action, sessionId ?? undefined), timeoutMs);
      } catch (err) {
        return {
          decision: "ALLOW",
          ruleIds: [],
          source: "timeout_allow",
          warning: `Shadow unavailable (${err instanceof Error ? err.message : String(err)}). ${action.ticket.id} was saved without a check.`,
        };
      }
      if (verdict.source === "timeout_allow") {
        return {
          ...verdict,
          warning: `Shadow's judge timed out on ${action.ticket.id}; the save was allowed.`,
        };
      }
      return verdict;
    },
  };
}

/** The default connector, talking to the Shadow API configured for this app. */
export const shadow: ShadowConnector = createShadowConnector();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
