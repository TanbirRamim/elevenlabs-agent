import type { ScreenEvent, TranscriptSegment, WorkMap } from "@shadow/schema";

export interface SessionRecord {
  id: string;
  mode: "capture" | "teach";
  /** Teach sessions reference the published map they teach from. */
  workMapId?: string;
  createdAt: Date;
  events: ScreenEvent[];
  transcript: TranscriptSegment[];
  /** Frames that were redacted and written to storage (HAR-8's evidence verifier checks these). */
  storedFrameIds: string[];
  offRecord: { on: boolean; spans: [number, number][]; since: number | null };
}

/**
 * Storage port. The in-memory adapter keeps the hackathon unblocked; the Postgres adapter
 * (Drizzle) implements the same interface, so routes never change.
 */
export interface Store {
  createSession(mode: SessionRecord["mode"], workMapId?: string): SessionRecord;
  getSession(id: string): SessionRecord | undefined;
  publishWorkMap(map: WorkMap): void;
  getPublishedWorkMap(): WorkMap | undefined;
}

export function createMemoryStore(): Store {
  const sessions = new Map<string, SessionRecord>();
  let published: WorkMap | undefined;
  return {
    createSession(mode, workMapId) {
      const rec: SessionRecord = {
        id: `ses_${crypto.randomUUID().slice(0, 8)}`,
        mode,
        ...(workMapId !== undefined ? { workMapId } : {}),
        createdAt: new Date(),
        events: [],
        transcript: [],
        storedFrameIds: [],
        offRecord: { on: false, spans: [], since: null },
      };
      sessions.set(rec.id, rec);
      return rec;
    },
    getSession: (id) => sessions.get(id),
    publishWorkMap(map) {
      published = map;
    },
    getPublishedWorkMap: () => published,
  };
}
