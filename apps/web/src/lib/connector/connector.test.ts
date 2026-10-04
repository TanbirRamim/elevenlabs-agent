import type { GuardVerdict, PendingAction } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { createShadowConnector } from "./index";
import { REFERENCE_RULES } from "./referenceRules";

const action = {
  ticket: {
    id: "T9",
    subject: "Charge I don't recognise",
    body: "Someone used my card without my permission.",
    tags: ["billing"],
    customer: { vip: false },
  },
  outcome: "refund",
} as unknown as PendingAction;

const harmless = {
  ...action,
  ticket: { ...action.ticket, body: "Where is my parcel?" },
  outcome: "reply",
} as unknown as PendingAction;

const block: GuardVerdict = {
  decision: "BLOCK",
  ruleIds: ["G4"],
  expectedOutcome: "handoff_security",
  source: "machine_rule",
};

/** A clock that advances by `step` ms on every read. */
function steppingClock(step: number): () => number {
  let t = 1000;
  return () => {
    const v = t;
    t += step;
    return v;
  };
}

const offline = async (): Promise<GuardVerdict> => {
  throw new Error("offline");
};

describe("shadow connector", () => {
  it("returns the verdict, forwards the session id and records the exchange", async () => {
    const transport = vi.fn(async () => block);
    const shadow = createShadowConnector({ transport, endpoint: "http://api/guard/presave" });
    const verdict = await shadow.check(action, { sessionId: "s1" });
    expect(verdict).toMatchObject({ ...block, via: "api" });
    expect(transport).toHaveBeenCalledWith(action, "s1");
    expect(verdict.exchange.request).toEqual({
      method: "POST",
      url: "http://api/guard/presave",
      headers: { "content-type": "application/json", "x-shadow-session": "s1" },
      body: action,
    });
    expect(verdict.exchange.response).toEqual({ ok: true, body: block });
  });

  it("measures the latency around the call", async () => {
    const shadow = createShadowConnector({ transport: async () => block, now: steppingClock(212) });
    expect((await shadow.check(action)).latencyMs).toBe(212);
  });

  it("measures real elapsed time with the default clock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
    const shadow = createShadowConnector({
      transport: () =>
        new Promise<GuardVerdict>((resolve) => setTimeout(() => resolve(block), 150)),
    });
    const pending = shadow.check(action);
    await vi.advanceTimersByTimeAsync(150);
    const verdict = await pending;
    vi.useRealTimers();
    expect(verdict.latencyMs).toBe(150);
  });

  it("fails open with a warning when Shadow does not answer in time and has no rules", async () => {
    vi.useFakeTimers();
    const shadow = createShadowConnector({
      transport: () => new Promise<GuardVerdict>(() => {}),
      timeoutMs: 100,
    });
    const pending = shadow.check(action);
    await vi.advanceTimersByTimeAsync(100);
    const verdict = await pending;
    vi.useRealTimers();
    expect(verdict.decision).toBe("ALLOW");
    expect(verdict.source).toBe("timeout_allow");
    expect(verdict.via).toBe("fail_open");
    expect(verdict.warning).toMatch(/T9 was saved without a check/);
  });

  it("fails open with a warning when the transport throws and has no rules", async () => {
    const verdict = await createShadowConnector({ transport: offline }).check(action);
    expect(verdict.decision).toBe("ALLOW");
    expect(verdict.warning).toContain("offline");
    expect(verdict.exchange.response).toEqual({ ok: false, error: "offline" });
  });

  it("holds a rule-breaking save in the browser when the API is offline", async () => {
    const verdict = await createShadowConnector({ transport: offline }).check(action, {
      fallbackRules: REFERENCE_RULES,
    });
    expect(verdict).toMatchObject({
      decision: "BLOCK",
      ruleIds: ["G4"],
      expectedOutcome: "handoff_security",
      source: "machine_rule",
      via: "browser",
    });
    expect(verdict.warning).toBeUndefined();
  });

  it("holds a rule-breaking save in the browser when the API times out", async () => {
    vi.useFakeTimers();
    const shadow = createShadowConnector({
      transport: () => new Promise<GuardVerdict>(() => {}),
      timeoutMs: 100,
      now: steppingClock(100),
    });
    const pending = shadow.check(action, { fallbackRules: REFERENCE_RULES });
    await vi.advanceTimersByTimeAsync(100);
    const verdict = await pending;
    vi.useRealTimers();
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.via).toBe("browser");
    expect(verdict.latencyMs).toBe(100);
  });

  it("allows a harmless save offline, but says only the machine rules ran", async () => {
    const verdict = await createShadowConnector({ transport: offline }).check(harmless, {
      fallbackRules: REFERENCE_RULES,
    });
    expect(verdict.decision).toBe("ALLOW");
    expect(verdict.via).toBe("browser");
    expect(verdict.warning).toMatch(/machine rules in the browser/);
  });

  it("warns when the server's judge timed out", async () => {
    const shadow = createShadowConnector({
      transport: async () => ({ decision: "ALLOW", ruleIds: [], source: "timeout_allow" }),
    });
    expect((await shadow.check(action)).warning).toMatch(/judge timed out on T9/);
  });
});
