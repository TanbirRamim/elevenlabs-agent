import { evaluate, type RuleRef } from "@shadow/guard";
import type { GuardVerdict, PendingAction } from "@shadow/schema";
import { publicEnv } from "../../env";
import { preSave } from "../api";

/**
 * The Singoda AI connector: the one integration hook a company's tool adds. Before it commits a
 * ticket action (refund, reply, escalation…), the tool calls `shadow.check(action)` and acts on
 * the verdict. Watching a screen can never stop a save; only a pre-commit call can. Capture needs
 * no connector at all (screen share only). See docs/CONNECTOR.md.
 */

/** The server's judge times out at 6 s; this covers that plus the network. */
export const DEFAULT_CHECK_TIMEOUT_MS = 6000;

export interface CheckOptions {
  /** The teach session the save belongs to; the API scores the verdict in its mastery report. */
  sessionId?: string | null;
  /**
   * Machine rules to run in the browser when the API can't answer (unreachable or too slow):
   * the loaded Work Map's, or the bundled reference rules. Without them the check fails open.
   */
  fallbackRules?: readonly RuleRef[];
}

/** What was sent and received, shown verbatim by the host ("View request"). Holds no secrets. */
export interface ConnectorExchange {
  request: {
    method: "POST";
    url: string;
    headers: Record<string, string>;
    body: PendingAction;
  };
  /** The verdict as returned, or the error when there was no answer. */
  response: { ok: true; body: GuardVerdict } | { ok: false; error: string };
}

/**
 * - `api`: the Singoda AI API answered.
 * - `browser`: the API did not answer; the fallback rules decided in the browser.
 * - `fail_open`: the API did not answer and there were no rules to fall back on.
 */
export type CheckVia = "api" | "browser" | "fail_open";

export interface ConnectorVerdict extends GuardVerdict {
  /**
   * Set when the save was not fully checked (Singoda AI could not answer, its judge timed out, or
   * only the machine rules ran in the browser). The host shows it so nobody believes otherwise.
   */
  warning?: string;
  /** Wall-clock time of the check, measured around the call (fallback included). */
  latencyMs: number;
  via: CheckVia;
  exchange: ConnectorExchange;
}

export type CheckTransport = (action: PendingAction, sessionId?: string) => Promise<GuardVerdict>;

export interface ShadowConnector {
  check(action: PendingAction, options?: CheckOptions): Promise<ConnectorVerdict>;
}

export interface ConnectorConfig {
  /** How the verdict is fetched. Default: `POST /guard/presave` on the Singoda AI API. */
  transport?: CheckTransport;
  timeoutMs?: number;
  /** The URL the transport calls, recorded in the exchange. */
  endpoint?: string;
  /** Monotonic clock in ms; injectable for tests. */
  now?: () => number;
}

export function createShadowConnector({
  transport = preSave,
  timeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
  endpoint = `${publicEnv.apiUrl.replace(/\/+$/, "")}/guard/presave`,
  now = () => performance.now(),
}: ConnectorConfig = {}): ShadowConnector {
  return {
    async check(action, { sessionId, fallbackRules } = {}) {
      const request: ConnectorExchange["request"] = {
        method: "POST",
        url: endpoint,
        headers: {
          "content-type": "application/json",
          ...(sessionId ? { "x-shadow-session": sessionId } : {}),
        },
        body: action,
      };
      const started = now();
      const elapsed = () => Math.max(0, Math.round(now() - started));
      let verdict: GuardVerdict;
      try {
        verdict = await withTimeout(transport(action, sessionId ?? undefined), timeoutMs);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const exchange: ConnectorExchange = { request, response: { ok: false, error } };
        if (fallbackRules) {
          const local = evaluate(action, fallbackRules);
          return {
            ...local,
            latencyMs: elapsed(),
            via: "browser",
            exchange,
            ...(local.decision === "ALLOW"
              ? {
                  warning: `Singoda AI's API is offline (${error}). ${action.ticket.id} passed the machine rules in the browser; judgment-only guardrails were not checked.`,
                }
              : {}),
          };
        }
        return {
          decision: "ALLOW",
          ruleIds: [],
          source: "timeout_allow",
          latencyMs: elapsed(),
          via: "fail_open",
          exchange,
          warning: `Singoda AI unavailable (${error}). ${action.ticket.id} was saved without a check.`,
        };
      }
      const latencyMs = elapsed();
      const exchange: ConnectorExchange = { request, response: { ok: true, body: verdict } };
      if (verdict.source === "timeout_allow") {
        return {
          ...verdict,
          latencyMs,
          via: "api",
          exchange,
          warning: `Singoda AI's judge timed out on ${action.ticket.id}; the save was allowed.`,
        };
      }
      return { ...verdict, latencyMs, via: "api", exchange };
    },
  };
}

/** The default connector, talking to the Singoda AI API configured for this app. */
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
