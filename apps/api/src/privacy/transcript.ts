import type { ClientMessage, TranscriptSegment } from "@shadow/schema";
import type { SessionRecord } from "../store/memory.js";
import { isOffRecord, offRecordPhrase, setOffRecord } from "./offRecord.js";
import type { RedactText } from "./presidio.js";

type TranscriptMessage = Extract<ClientMessage, { type: "transcript" }>;

/**
 * One transcript segment: apply spoken off-record toggles, drop off-record
 * segments entirely, redact everything else before it is stored. The segment
 * that says "off the record" opens the span at its own start, so it is dropped
 * too; the "back on the record" segment closes the span at its end, likewise.
 * Returns the stored (redacted) segment, or null when it was dropped.
 */
export async function ingestTranscript(
  session: SessionRecord,
  m: TranscriptMessage,
  redactText: RedactText,
): Promise<TranscriptSegment | null> {
  if (m.speaker === "expert") {
    const toggle = offRecordPhrase(m.text);
    if (toggle === true) setOffRecord(session, true, m.tStartMs);
    if (toggle === false) setOffRecord(session, false, m.tEndMs);
  }
  if (isOffRecord(session, m.tStartMs)) return null; // dropped, never stored
  const text = await redactText(m.text);
  // Redaction latency varies per segment, so a later segment can finish first.
  // Insert by start time to keep the stored transcript in spoken order.
  const at = session.transcript.findIndex((s) => s.tStartMs > m.tStartMs);
  const stored: TranscriptSegment = {
    id: m.segmentId,
    tStartMs: m.tStartMs,
    tEndMs: m.tEndMs,
    speaker: m.speaker,
    text,
    offRecord: false,
  };
  if (at === -1) session.transcript.push(stored);
  else session.transcript.splice(at, 0, stored);
  return stored;
}
