import type {
  GuardVerdict,
  OpenQuestion,
  Outcome,
  ScreenEvent,
  TranscriptSegment,
  WorkMap,
} from "@shadow/schema";

/** A curiosity question the expert answered live (persisted here so HTTP routes can see it). */
export interface AnsweredQuestionRecord {
  ticketId: string;
  slot: OpenQuestion["slot"];
  question: string;
  answerSegmentIds: string[];
}

/** A learner's answer to a `[PREDICT]`, scored against the map (POST /sessions/:id/predictions). */
export interface PredictionRecord {
  ticketId: string;
  stepId: string;
  /** The guardrail the prediction was scored against, when the map resolved one. */
  guardrailId: string | null;
  predictedOutcome: Outcome;
  expectedOutcome: Outcome;
  correct: boolean;
  tMs: number;
  at: number;
}

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
  /** Written through by the Curiosity Engine; read by /sessions/:id/end. */
  answeredQuestions: AnsweredQuestionRecord[];
  /** Gaps that decayed unanswered; the debrief asks them. */
  debriefQueue: OpenQuestion[];
  /** Every pre-save verdict in this session (mastery report input, HAR-12). */
  guardVerdicts: { ticketId: string; outcome: Outcome; verdict: GuardVerdict; at: number }[];
  /** Every scored learner prediction in this session (mastery report input, HAR-12). */
  predictions: PredictionRecord[];
  offRecord: { on: boolean; spans: [number, number][]; since: number | null };
}

/**
 * Storage port. The in-memory adapter keeps the hackathon unblocked; the Postgres adapter
 * (Drizzle) implements the same interface, so routes never change.
 */
export interface Store {
  createSession(mode: SessionRecord["mode"], workMapId?: string): SessionRecord;
  getSession(id: string): SessionRecord | undefined;
  /** Draft maps (built at session end, edited during debrief) — distinct from the published one. */
  saveWorkMap(map: WorkMap): void;
  getWorkMap(id: string): WorkMap | undefined;
  publishWorkMap(map: WorkMap): void;
  getPublishedWorkMap(): WorkMap | undefined;
}

export function createMemoryStore(): Store {
  const sessions = new Map<string, SessionRecord>();
  const drafts = new Map<string, WorkMap>();
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
        answeredQuestions: [],
        debriefQueue: [],
        guardVerdicts: [],
        predictions: [],
        offRecord: { on: false, spans: [], since: null },
      };
      sessions.set(rec.id, rec);
      return rec;
    },
    getSession: (id) => sessions.get(id),
    saveWorkMap(map) {
      drafts.set(map.id, map);
    },
    getWorkMap: (id) => drafts.get(id),
    publishWorkMap(map) {
      published = map;
    },
    getPublishedWorkMap: () => published,
  };
}
