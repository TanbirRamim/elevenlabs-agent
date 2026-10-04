// @vitest-environment jsdom
import type { DeskEvent, GuardVerdict, PendingAction, PublicTicket } from "@shadow/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeskSim } from "./DeskSim";
import { DESK_ROOT_ID, PII_ATTR } from "./types";

afterEach(cleanup);

const T3: PublicTicket = {
  id: "T3",
  subject: "Chargeback opened for order 8841",
  body: "The customer opened a chargeback with their bank over a €49.90 charge.",
  customer: {
    name: "Jon Tester",
    email: "jon@example.test",
    plan: "annual",
    vip: false,
    accountAgeDays: 220,
  },
  amountEur: 49.9,
  tags: ["billing", "chargeback"],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup(preSave: (action: PendingAction) => Promise<GuardVerdict>) {
  const clockState = { now: 0 };
  const onDeskEvent = vi.fn<(event: DeskEvent) => void>();
  const utils = render(
    <DeskSim
      tickets={[T3]}
      mode="teach"
      clock={() => clockState.now}
      onDeskEvent={onDeskEvent}
      preSave={preSave}
    />,
  );
  return { clockState, onDeskEvent, ...utils };
}

function emitted(onDeskEvent: ReturnType<typeof vi.fn<(event: DeskEvent) => void>>) {
  return onDeskEvent.mock.calls.map(([event]) => event);
}

describe("DeskSim", () => {
  it("keeps a BLOCKed action uncommitted and emits no action_committed", async () => {
    const d = deferred<GuardVerdict>();
    const preSave = vi.fn(() => d.promise);
    const { onDeskEvent } = setup(preSave);

    fireEvent.click(screen.getByRole("button", { name: /chargeback opened/i }));
    fireEvent.click(screen.getByRole("button", { name: /^refund$/i }));

    expect(screen.getByText(/checking/i)).toBeTruthy();
    const refundButton = screen.getByRole("button", { name: /^refund$/i }) as HTMLButtonElement;
    expect(refundButton.disabled).toBe(true);
    expect(preSave).toHaveBeenCalledWith({ ticket: T3, outcome: "refund", amountEur: 49.9 });

    d.resolve({
      decision: "BLOCK",
      ruleIds: ["G2"],
      expectedOutcome: "handoff_billing_disputes",
      source: "machine_rule",
    });
    await screen.findByText(/paused by shadow/i);

    expect(emitted(onDeskEvent).map((e) => e.type)).not.toContain("action_committed");
    expect(screen.queryByText(/committed:/i)).toBeNull();
  });

  it("clears the pause when another action is picked and commits it", async () => {
    const first = deferred<GuardVerdict>();
    const second = deferred<GuardVerdict>();
    let call = 0;
    const preSave = vi.fn(() => (call++ === 0 ? first.promise : second.promise));
    const { onDeskEvent } = setup(preSave);

    fireEvent.click(screen.getByRole("button", { name: /chargeback opened/i }));
    fireEvent.click(screen.getByRole("button", { name: /^refund$/i }));
    first.resolve({ decision: "BLOCK", ruleIds: ["G2"], source: "machine_rule" });
    await screen.findByText(/paused by shadow/i);

    fireEvent.click(screen.getByRole("button", { name: /handoff: billing disputes/i }));
    second.resolve({ decision: "ALLOW", ruleIds: [], source: "machine_rule" });
    await screen.findByText(/committed:/i);

    expect(screen.queryByText(/paused by shadow/i)).toBeNull();
    const commits = emitted(onDeskEvent).filter((e) => e.type === "action_committed");
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ ticketId: "T3", outcome: "handoff_billing_disputes" });
  });

  it("commits REQUIRE_APPROVAL with an approval note and the edited refund amount", async () => {
    const preSave = vi.fn(
      async (): Promise<GuardVerdict> => ({
        decision: "REQUIRE_APPROVAL",
        ruleIds: ["G1"],
        source: "machine_rule",
      }),
    );
    const { onDeskEvent } = setup(preSave);

    fireEvent.click(screen.getByRole("button", { name: /chargeback opened/i }));
    const input = screen.getByLabelText(/refund amount/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: /^refund$/i }));
    await screen.findByText(/approval requested/i);

    const events = emitted(onDeskEvent);
    expect(events).toContainEqual({
      type: "field_changed",
      tMs: 0,
      ticketId: "T3",
      field: "refund_amount",
      from: "49.9",
      to: "25",
    });
    const commits = events.filter((e) => e.type === "action_committed");
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ ticketId: "T3", outcome: "refund", amountEur: 25 });
  });

  it("stamps events with clock(), throttles input_activity to 500 ms, and marks PII", () => {
    const preSave = vi.fn(
      async (): Promise<GuardVerdict> => ({
        decision: "ALLOW",
        ruleIds: [],
        source: "machine_rule",
      }),
    );
    const { clockState, onDeskEvent, container } = setup(preSave);

    clockState.now = 1234;
    fireEvent.click(screen.getByRole("button", { name: /chargeback opened/i }));
    expect(onDeskEvent).toHaveBeenCalledWith({ type: "input_activity", tMs: 1234 });
    expect(onDeskEvent).toHaveBeenCalledWith({ type: "ticket_opened", tMs: 1234, ticketId: "T3" });

    const root = container.querySelector(`#${DESK_ROOT_ID}`);
    if (!root) throw new Error("desk root missing");
    clockState.now = 1400;
    fireEvent.keyDown(root, { key: "a" });
    clockState.now = 1800;
    fireEvent.keyDown(root, { key: "a" });

    const activity = emitted(onDeskEvent).filter((e) => e.type === "input_activity");
    expect(activity.map((e) => e.tMs)).toEqual([1234, 1800]);

    expect(container.querySelectorAll(`[${PII_ATTR}]`).length).toBe(2);
  });
});
