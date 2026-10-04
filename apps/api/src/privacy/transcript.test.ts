import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/memory.js";
import { offRecordPhrase, setOffRecord } from "./offRecord.js";
import { REDACTION_UNAVAILABLE, type RedactText, unavailableRedactor } from "./presidio.js";
import { ingestTranscript } from "./transcript.js";

const fakeRedactor: RedactText = async (text) =>
  text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<EMAIL_ADDRESS>");

function segment(over: Partial<Parameters<typeof ingestTranscript>[1]> = {}) {
  return {
    type: "transcript" as const,
    segmentId: "seg_1",
    tStartMs: 1000,
    tEndMs: 2000,
    speaker: "expert" as const,
    text: "hello",
    ...over,
  };
}

describe("ingestTranscript", () => {
  it("stores a segment containing an email redacted", async () => {
    const session = createMemoryStore().createSession("capture");
    await ingestTranscript(
      session,
      segment({ text: "escalate it to ava@example.test please" }),
      fakeRedactor,
    );
    expect(session.transcript).toHaveLength(1);
    expect(session.transcript[0]?.text).toBe("escalate it to <EMAIL_ADDRESS> please");
  });

  it("does not store a segment inside an off-record span", async () => {
    const session = createMemoryStore().createSession("capture");
    setOffRecord(session, true, 500);
    await ingestTranscript(session, segment({ tStartMs: 1000 }), fakeRedactor);
    setOffRecord(session, false, 3000);
    await ingestTranscript(
      session,
      segment({ segmentId: "seg_2", tStartMs: 4000, tEndMs: 5000 }),
      fakeRedactor,
    );
    expect(session.transcript.map((s) => s.id)).toEqual(["seg_2"]);
  });

  it("stores the placeholder when redaction is unavailable", async () => {
    const session = createMemoryStore().createSession("capture");
    await ingestTranscript(session, segment({ text: "raw pii text" }), unavailableRedactor);
    expect(session.transcript[0]?.text).toBe(REDACTION_UNAVAILABLE);
    expect(JSON.stringify(session.transcript)).not.toContain("raw pii");
  });

  it("toggles off the record from spoken expert phrases, idempotently", async () => {
    const session = createMemoryStore().createSession("capture");
    await ingestTranscript(
      session,
      segment({ text: "let's go off the record for a second" }),
      fakeRedactor,
    );
    expect(session.offRecord.on).toBe(true);
    expect(session.transcript).toHaveLength(0); // the toggling segment is dropped too

    // saying it again changes nothing
    await ingestTranscript(
      session,
      segment({ segmentId: "seg_2", tStartMs: 3000, tEndMs: 4000, text: "off the record" }),
      fakeRedactor,
    );
    expect(session.offRecord.on).toBe(true);

    await ingestTranscript(
      session,
      segment({ segmentId: "seg_3", tStartMs: 5000, tEndMs: 6000, text: "ok, back on the record" }),
      fakeRedactor,
    );
    expect(session.offRecord.on).toBe(false);
    expect(session.offRecord.spans).toEqual([[1000, 6000]]);

    await ingestTranscript(
      session,
      segment({ segmentId: "seg_4", tStartMs: 7000, tEndMs: 8000, text: "so, as I was saying" }),
      fakeRedactor,
    );
    expect(session.transcript.map((s) => s.id)).toEqual(["seg_4"]);
  });

  it("ignores off-record phrases from non-expert speakers", async () => {
    const session = createMemoryStore().createSession("capture");
    await ingestTranscript(
      session,
      segment({ speaker: "agent", text: "we can go off the record if you like" }),
      fakeRedactor,
    );
    expect(session.offRecord.on).toBe(false);
    expect(session.transcript).toHaveLength(1);
  });
});

describe("offRecordPhrase", () => {
  it.each([
    ["let's go OFF the record", true],
    ["back on the record now", false],
    ["the record shows otherwise", null],
  ])("%s -> %s", (text, expected) => {
    expect(offRecordPhrase(text)).toBe(expected);
  });

  it("keeps spoken order when a later segment finishes redaction first", async () => {
    const session = createMemoryStore().createSession("capture");
    let releaseFirst: () => void = () => {};
    const slowFirst: RedactText = (text) =>
      text === "first"
        ? new Promise((resolve) => {
            releaseFirst = () => resolve(text);
          })
        : Promise.resolve(text);
    const first = ingestTranscript(
      session,
      segment({ segmentId: "a", tStartMs: 1000, text: "first" }),
      slowFirst,
    );
    await ingestTranscript(
      session,
      segment({ segmentId: "b", tStartMs: 5000, text: "second" }),
      slowFirst,
    );
    releaseFirst();
    await first;
    expect(session.transcript.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
