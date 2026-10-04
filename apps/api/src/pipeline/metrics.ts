import type { Outcome } from "@shadow/schema";

/** Keywords a vision "action" event must mention to count as the same outcome. */
const OUTCOME_KEYWORDS: Record<Outcome, string[]> = {
  reply: ["reply", "replied", "respond"],
  refund: ["refund"],
  hold_request_info: ["hold", "request info", "more info"],
  escalate_tier2: ["tier 2", "tier2"],
  escalate_engineering: ["engineering"],
  handoff_security: ["security"],
  handoff_legal: ["legal"],
  handoff_billing_disputes: ["billing dispute", "dispute"],
  close: ["close", "closed"],
};

/** Most specific first: "hand off to billing disputes" must not read as a plain refund or reply. */
const OUTCOME_ORDER: Outcome[] = [
  "handoff_security",
  "handoff_legal",
  "handoff_billing_disputes",
  "escalate_engineering",
  "escalate_tier2",
  "hold_request_info",
  "refund",
  "close",
  "reply",
];

/** The outcome a vision "action" text names, or null when it names none (§6.3 keywords). */
export function outcomeFromText(text: string): Outcome | null {
  const t = text.toLowerCase();
  return OUTCOME_ORDER.find((o) => OUTCOME_KEYWORDS[o].some((k) => t.includes(k))) ?? null;
}

export interface DomAction {
  tMs: number;
  ticketId: string;
  outcome: Outcome;
}

export interface VisionAction {
  tMs: number;
  /** Concatenated object+field+from+to+fact of a vision kind:"action" event. */
  text: string;
}

export function p90(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1);
  return sorted[idx] ?? null;
}

/**
 * The record id in a vision `object` ("ticket T3", "#t12", "ticket 4471"), upper-cased, or null.
 * Prefers a letter+digits id (T3) over a bare number so "T4 refund 120" reads as T4.
 */
export function ticketIdFrom(text: string): string | null {
  const lettered = /\b#?([a-z]{1,3}-?\d+)\b/i.exec(text);
  if (lettered?.[1]) return lettered[1].replace("-", "").toUpperCase();
  const numeric = /(?:^|[\s#])(\d{2,})\b/.exec(text);
  return numeric?.[1] ?? null;
}

/** True when `text` names ticket `id` as a whole token: "T1" is not inside "T10". */
export function mentionsTicket(text: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
}

/** §6.3: same ticket and outcome within 5 s counts as agreement. */
export function matchesDomAction(dom: DomAction, vision: VisionAction): boolean {
  if (Math.abs(vision.tMs - dom.tMs) > 5000) return false;
  if (!mentionsTicket(vision.text, dom.ticketId)) return false;
  // The most specific outcome the text names, so a handoff that mentions a refund is a handoff.
  return outcomeFromText(vision.text) === dom.outcome;
}

export interface PipelineMetrics {
  recordLatency(ms: number): void;
  recordUnreadable(): void;
  recordDomAction(action: DomAction): void;
  recordVisionAction(action: VisionAction): void;
  latencyP90(): number | null;
  unreadableCount(): number;
  /** matched DOM actions / total DOM actions; null before the first DOM action. */
  agreement(): number | null;
}

export function createMetrics(): PipelineMetrics {
  const latencies: number[] = [];
  const domActions: DomAction[] = [];
  const visionActions: VisionAction[] = [];
  let unreadable = 0;
  return {
    recordLatency: (ms) => {
      latencies.push(ms);
    },
    recordUnreadable: () => {
      unreadable += 1;
    },
    recordDomAction: (a) => {
      domActions.push(a);
    },
    recordVisionAction: (a) => {
      visionActions.push(a);
    },
    latencyP90: () => p90(latencies),
    unreadableCount: () => unreadable,
    agreement: () => {
      if (domActions.length === 0) return null;
      const matched = domActions.filter((d) =>
        visionActions.some((v) => matchesDomAction(d, v)),
      ).length;
      return matched / domActions.length;
    },
  };
}
