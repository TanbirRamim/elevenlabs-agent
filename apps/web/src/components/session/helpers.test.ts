import { describe, expect, it } from "vitest";
import {
  describeDeskEvent,
  detectRecordPhrase,
  gapRemainingMs,
  listeningStateFor,
  micLevel,
  orbStateFor,
  questionsInWindow,
} from "./helpers";

describe("describeDeskEvent", () => {
  it("describes the events the agent should hear about", () => {
    expect(describeDeskEvent({ type: "ticket_opened", tMs: 0, ticketId: "T3" })).toBe(
      "ticket T3 opened",
    );
    expect(
      describeDeskEvent({
        type: "field_changed",
        tMs: 0,
        ticketId: "T3",
        field: "refund amount",
        from: null,
        to: "240",
      }),
    ).toBe("ticket T3: refund amount changed from empty to 240");
    expect(
      describeDeskEvent({
        type: "action_committed",
        tMs: 0,
        ticketId: "T4",
        outcome: "handoff_security",
      }),
    ).toBe("ticket T4 handed off to Security");
    expect(
      describeDeskEvent({
        type: "action_committed",
        tMs: 0,
        ticketId: "T2",
        outcome: "refund",
        amountEur: 49,
      }),
    ).toBe("ticket T2 refunded (€49)");
  });

  it("keeps raw input activity out of the agent's context", () => {
    expect(describeDeskEvent({ type: "input_activity", tMs: 0 })).toBeNull();
  });
});

describe("detectRecordPhrase", () => {
  it("detects the spoken commands", () => {
    expect(detectRecordPhrase("Okay, this is off the record.")).toBe("off");
    expect(detectRecordPhrase("Back on the record now")).toBe("on");
    expect(detectRecordPhrase("Never refund with an open chargeback")).toBeNull();
  });

  it("does not treat a plain mention of 'on the record' as a command", () => {
    expect(detectRecordPhrase("It is on the record in the ticket history")).toBeNull();
  });

  it("prefers 'back on the record' when both appear in one line", () => {
    expect(detectRecordPhrase("sorry, not off the record, back on the record")).toBe("on");
  });
});

describe("orbStateFor", () => {
  it("is quiet until the voice session is connected", () => {
    expect(orbStateFor("disconnected", "listening", false, false)).toBe("idle");
    expect(orbStateFor("connecting", "speaking", true, false)).toBe("idle");
    expect(orbStateFor("error", "listening", false, false)).toBe("idle");
  });

  it("listens while connected and asks while the agent speaks", () => {
    expect(orbStateFor("connected", "listening", false, false)).toBe("listening");
    expect(orbStateFor("connected", "speaking", false, false)).toBe("speaking");
    expect(orbStateFor("connected", "listening", true, false)).toBe("speaking");
  });

  it("shows off the record over every other state", () => {
    expect(orbStateFor("connected", "speaking", true, true)).toBe("off-record");
    expect(orbStateFor("disconnected", "listening", false, true)).toBe("off-record");
  });
});

describe("listeningStateFor", () => {
  it("is off until the voice session is connected", () => {
    expect(listeningStateFor("disconnected", "listening", false, false)).toBe("off");
    expect(listeningStateFor("error", "speaking", true, false)).toBe("off");
  });

  it("asks while Shadow speaks, even when holding", () => {
    expect(listeningStateFor("connected", "speaking", false, false)).toBe("asking");
    expect(listeningStateFor("connected", "listening", true, true)).toBe("asking");
  });

  it("is quiet while holding questions and listening otherwise", () => {
    expect(listeningStateFor("connected", "listening", false, true)).toBe("quiet");
    expect(listeningStateFor("connected", "listening", false, false)).toBe("listening");
  });
});

describe("question budget", () => {
  it("counts only questions in the last ten minutes", () => {
    expect(questionsInWindow([10_000, 400_000, 650_000], 700_000)).toBe(2);
    expect(questionsInWindow([], 700_000)).toBe(0);
  });

  it("reports the time left in the minimum gap", () => {
    expect(gapRemainingMs([], 50_000, 90_000)).toBe(0);
    expect(gapRemainingMs([10_000], 50_000, 90_000)).toBe(50_000);
    expect(gapRemainingMs([10_000], 200_000, 90_000)).toBe(0);
  });
});

describe("micLevel", () => {
  it("scales speech-level volume into the meter range and clamps", () => {
    expect(micLevel(0)).toBe(0);
    expect(micLevel(0.2)).toBeCloseTo(0.5);
    expect(micLevel(0.9)).toBe(1);
    expect(micLevel(Number.NaN)).toBe(0);
  });

  it("rises at once and falls gradually", () => {
    expect(micLevel(0.4, 0.1)).toBe(1);
    expect(micLevel(0, 1)).toBeCloseTo(0.6);
  });
});
