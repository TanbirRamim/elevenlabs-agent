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

/** §6.3: same ticket and outcome within 5 s counts as agreement. */
export function matchesDomAction(dom: DomAction, vision: VisionAction): boolean {
  if (Math.abs(vision.tMs - dom.tMs) > 5000) return false;
  const text = vision.text.toLowerCase();
  if (!text.includes(dom.ticketId.toLowerCase())) return false;
  return OUTCOME_KEYWORDS[dom.outcome].some((k) => text.includes(k));
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
