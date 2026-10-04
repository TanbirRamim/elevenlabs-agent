import type { GuardVerdict, PendingAction } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { createShadowConnector } from "./index";

const action = {
  ticket: { id: "N1" },
  outcome: "refund",
} as unknown as PendingAction;

const block: GuardVerdict = {
  decision: "BLOCK",
  ruleIds: ["G4"],
  expectedOutcome: "handoff_security",
  source: "machine_rule",
};

describe("shadow connector", () => {
  it("returns the verdict and forwards the session id", async () => {
    const transport = vi.fn(async () => block);
    const shadow = createShadowConnector({ transport });
    await expect(shadow.check(action, { sessionId: "s1" })).resolves.toEqual(block);
    expect(transport).toHaveBeenCalledWith(action, "s1");
  });

  it("fails open with a warning when Shadow does not answer in time", async () => {
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
    expect(verdict.warning).toMatch(/N1 was saved without a check/);
  });

  it("fails open with a warning when the transport throws", async () => {
    const shadow = createShadowConnector({
      transport: async () => {
        throw new Error("offline");
      },
    });
    const verdict = await shadow.check(action);
    expect(verdict.decision).toBe("ALLOW");
    expect(verdict.warning).toContain("offline");
  });

  it("warns when the server's judge timed out", async () => {
    const shadow = createShadowConnector({
      transport: async () => ({ decision: "ALLOW", ruleIds: [], source: "timeout_allow" }),
    });
    expect((await shadow.check(action)).warning).toMatch(/judge timed out on N1/);
  });
});
