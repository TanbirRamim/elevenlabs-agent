import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GuardVerdict,
  OpenQuestion,
  Outcome,
  ScreenEvent,
  TranscriptSegment,
  WorkMap,
} from "@shadow/schema";
import { z } from "zod";
import type { ObjectStorage } from "../storage/types.js";
import { createMemoryStore, type SessionRecord, type Store } from "./memory.js";

// The id becomes a file name and an object key, so it is restricted to a safe charset.
const SessionData = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  mode: z.enum(["capture", "teach"]),
  workMapId: z.string().optional(),
  createdAt: z.coerce.date(),
  events: z.array(ScreenEvent),
  transcript: z.array(TranscriptSegment),
  storedFrameIds: z.array(z.string()),
  answeredQuestions: z.array(
    z.object({
      ticketId: z.string(),
      slot: OpenQuestion.shape.slot,
      question: z.string(),
      answerSegmentIds: z.array(z.string()),
    }),
  ),
  debriefQueue: z.array(OpenQuestion),
  // Snapshots written before verdicts were recorded replay with none.
  guardVerdicts: z
    .array(
      z.object({ ticketId: z.string(), outcome: Outcome, verdict: GuardVerdict, at: z.number() }),
    )
    .default([]),
  // Likewise for snapshots written before predictions were recorded.
  predictions: z
    .array(
      z.object({
        ticketId: z.string(),
        stepId: z.string(),
        guardrailId: z.string().nullable(),
        predictedOutcome: Outcome,
        expectedOutcome: Outcome,
        correct: z.boolean(),
        tMs: z.number(),
        at: z.number(),
      }),
    )
    .default([]),
  offRecord: z.object({
    on: z.boolean(),
    spans: z.array(z.tuple([z.number(), z.number()])),
    since: z.number().nullable(),
  }),
});
const SessionSnapshot = z.object({ kind: z.literal("session"), data: z.unknown() });
const MapSnapshot = z.object({
  kind: z.enum(["draft", "published"]),
  data: z.record(z.string(), z.unknown()),
});
/** ObjectStorage has no list, so the mirror keeps an index of what it holds. */
const MirrorIndex = z.object({
  sessions: z.array(z.string()),
  drafts: z.array(z.string()),
  published: z.string().nullable(),
});
const INDEX_KEY = "state/index.json";

export interface JsonlStoreDeps {
  /** Local JSONL directory (infra/data in development; container-local in prod). */
  dir: string;
  /** Optional durable mirror (R2 via the S3 adapter) — the only copy that survives a container wipe. */
  storage?: ObjectStorage | null;
  flushMs?: number;
  log?: { warn: (obj: object, msg: string) => void };
}

export interface PersistentStore extends Store {
  /** Snapshot all dirty state now (also runs on an interval). */
  flush(): Promise<void>;
  close(): Promise<void>;
}

/** JSON.parse that yields undefined for a torn or non-JSON line instead of throwing. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A validated session, or null for anything foreign or malformed. */
function toSession(data: unknown): SessionRecord | null {
  const parsed = SessionData.safeParse(data);
  if (!parsed.success) return null;
  const { workMapId, ...rest } = parsed.data;
  return { ...rest, ...(workMapId !== undefined ? { workMapId } : {}) };
}

async function readBody(body: NodeJS.ReadableStream | Buffer): Promise<string> {
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * JSONL adapter over the in-memory store: every flush appends a full snapshot
 * line per changed session/map; boot replays the last valid line per entity
 * (a crash can tear the final line). In production the container disk is wiped
 * on stop, so flushes also mirror to R2 when configured, and boot restores
 * whatever the local disk lacks from there. The in-memory adapter stays the
 * default for tests.
 */
export async function createJsonlStore({
  dir,
  storage = null,
  flushMs = 1000,
  log,
}: JsonlStoreDeps): Promise<PersistentStore> {
  const inner = createMemoryStore();
  const sessionsDir = join(dir, "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  const mapsFile = join(dir, "workmaps.jsonl");

  const sessions = new Map<string, SessionRecord>();
  const lastWritten = new Map<string, string>();

  // --- replay on boot ---
  if (existsSync(sessionsDir)) {
    for (const file of readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"))) {
      const lines = readFileSync(join(sessionsDir, file), "utf8").trim().split("\n");
      let session: SessionRecord | null = null;
      for (let i = lines.length - 1; i >= 0 && !session; i--) {
        const line = SessionSnapshot.safeParse(parseJson(lines[i] ?? ""));
        session = line.success ? toSession(line.data.data) : null;
        if (!session) log?.warn({ file, line: i + 1 }, "skipping unreadable session snapshot");
      }
      if (!session) continue;
      sessions.set(session.id, session);
      lastWritten.set(session.id, JSON.stringify(session));
    }
  }
  if (existsSync(mapsFile)) {
    for (const line of readFileSync(mapsFile, "utf8").trim().split("\n")) {
      if (!line) continue;
      try {
        const parsed = MapSnapshot.parse(JSON.parse(line));
        const map = WorkMap.parse(parsed.data);
        if (parsed.kind === "draft") inner.saveWorkMap(map);
        else inner.publishWorkMap(map);
      } catch (err) {
        log?.warn({ err: String(err) }, "skipping unreadable workmap snapshot");
      }
    }
  }

  // --- restore from the mirror whatever the local disk lacks (wiped container) ---
  const draftIds = new Set<string>();
  let publishedId = inner.getPublishedWorkMap()?.id ?? null;
  const getJson = async (key: string): Promise<unknown> => {
    if (!storage) return undefined;
    try {
      const res = await storage.get(key);
      return res.status === 200 ? parseJson(await readBody(res.body)) : undefined;
    } catch (err) {
      log?.warn({ key, err: String(err) }, "r2 restore read failed");
      return undefined;
    }
  };
  const index = MirrorIndex.safeParse(await getJson(INDEX_KEY));
  if (index.success) {
    for (const id of index.data.sessions) {
      if (sessions.has(id)) continue; // local disk is written first, so it is never older
      const session = toSession(await getJson(`state/sessions/${id}.json`));
      if (!session) {
        log?.warn({ id }, "skipping unreadable mirrored session");
        continue;
      }
      sessions.set(session.id, session);
      lastWritten.set(session.id, JSON.stringify(session));
    }
    const restoreMap = async (kind: "draft" | "published", id: string) => {
      const map = WorkMap.safeParse(await getJson(`state/workmaps/${kind}-${id}.json`));
      if (!map.success) return log?.warn({ id, kind }, "skipping unreadable mirrored map");
      if (kind === "draft") inner.saveWorkMap(map.data);
      else inner.publishWorkMap(map.data);
    };
    for (const id of index.data.drafts) {
      draftIds.add(id);
      if (!inner.getWorkMap(id)) await restoreMap("draft", id);
    }
    if (index.data.published && !publishedId) await restoreMap("published", index.data.published);
    publishedId ??= index.data.published;
  }

  // Mirror writes are chained per key: a slow older put can never land after a
  // newer one, and close() can wait for every write still in flight.
  const chains = new Map<string, Promise<void>>();
  const mirror = (key: string, body: string) => {
    if (!storage) return;
    const next = (chains.get(key) ?? Promise.resolve())
      .then(() => storage.put(key, Buffer.from(body), "application/json"))
      .catch((err: unknown) => log?.warn({ key, err: String(err) }, "r2 mirror failed"));
    chains.set(key, next);
  };
  const mirrorIndex = () =>
    mirror(
      INDEX_KEY,
      JSON.stringify({
        sessions: [...sessions.keys()],
        drafts: [...draftIds],
        published: publishedId,
      }),
    );

  const persistSession = (session: SessionRecord) => {
    const data = JSON.stringify(session);
    if (lastWritten.get(session.id) === data) return;
    lastWritten.set(session.id, data);
    const line = `${JSON.stringify({ kind: "session", data: JSON.parse(data) })}\n`;
    appendFileSync(join(sessionsDir, `${session.id}.jsonl`), line);
    mirror(`state/sessions/${session.id}.json`, data);
  };

  const persistMap = (kind: "draft" | "published", map: WorkMap) => {
    appendFileSync(mapsFile, `${JSON.stringify({ kind, data: map })}\n`);
    mirror(`state/workmaps/${kind}-${map.id}.json`, JSON.stringify(map));
    if (kind === "draft") draftIds.add(map.id);
    else publishedId = map.id;
    mirrorIndex();
  };

  const flush = async () => {
    for (const session of sessions.values()) persistSession(session);
    await Promise.all(chains.values());
  };
  // A throw here (disk full, dir removed) would otherwise be an unhandled
  // rejection, which takes the whole API process down.
  const interval = setInterval(() => {
    flush().catch((err: unknown) => log?.warn({ err: String(err) }, "session flush failed"));
  }, flushMs);

  return {
    createSession(mode, workMapId) {
      const session = inner.createSession(mode, workMapId);
      sessions.set(session.id, session);
      persistSession(session);
      mirrorIndex();
      return session;
    },
    getSession: (id) => sessions.get(id) ?? inner.getSession(id),
    saveWorkMap(map) {
      inner.saveWorkMap(map);
      persistMap("draft", map);
    },
    getWorkMap: (id) => inner.getWorkMap(id),
    publishWorkMap(map) {
      inner.publishWorkMap(map);
      persistMap("published", map);
    },
    getPublishedWorkMap: () => inner.getPublishedWorkMap(),
    flush,
    async close() {
      clearInterval(interval);
      await flush();
    },
  };
}
