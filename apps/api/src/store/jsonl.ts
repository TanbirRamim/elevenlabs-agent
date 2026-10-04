import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkMap } from "@shadow/schema";
import { z } from "zod";
import type { ObjectStorage } from "../storage/types.js";
import { createMemoryStore, type SessionRecord, type Store } from "./memory.js";

const SessionSnapshot = z.object({
  kind: z.literal("session"),
  data: z.record(z.string(), z.unknown()),
});
const MapSnapshot = z.object({
  kind: z.enum(["draft", "published"]),
  data: z.record(z.string(), z.unknown()),
});

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

function reviveSession(raw: Record<string, unknown>): SessionRecord {
  return {
    ...(raw as unknown as SessionRecord),
    createdAt: new Date(String(raw.createdAt)),
  };
}

/**
 * JSONL adapter over the in-memory store: every flush appends a full snapshot
 * line per changed session/map; boot replays the last line per entity. In
 * production the container disk is wiped on stop, so flushes also mirror to R2
 * when configured. The in-memory adapter stays the default for tests.
 */
export function createJsonlStore({
  dir,
  storage = null,
  flushMs = 1000,
  log,
}: JsonlStoreDeps): PersistentStore {
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
      const last = lines.at(-1);
      if (!last) continue;
      try {
        const parsed = SessionSnapshot.parse(JSON.parse(last));
        const session = reviveSession(parsed.data);
        sessions.set(session.id, session);
        lastWritten.set(session.id, JSON.stringify(parsed.data));
      } catch (err) {
        log?.warn({ file, err: String(err) }, "skipping unreadable session snapshot");
      }
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

  const persistSession = async (session: SessionRecord) => {
    const data = JSON.stringify(session);
    if (lastWritten.get(session.id) === data) return;
    lastWritten.set(session.id, data);
    const line = `${JSON.stringify({ kind: "session", data: JSON.parse(data) })}\n`;
    appendFileSync(join(sessionsDir, `${session.id}.jsonl`), line);
    if (storage) {
      await storage
        .put(`state/sessions/${session.id}.json`, Buffer.from(data), "application/json")
        .catch((err: unknown) => log?.warn({ err: String(err) }, "r2 session mirror failed"));
    }
  };

  const persistMap = async (kind: "draft" | "published", map: WorkMap) => {
    appendFileSync(mapsFile, `${JSON.stringify({ kind, data: map })}\n`);
    if (storage) {
      await storage
        .put(
          `state/workmaps/${kind}-${map.id}.json`,
          Buffer.from(JSON.stringify(map)),
          "application/json",
        )
        .catch((err: unknown) => log?.warn({ err: String(err) }, "r2 map mirror failed"));
    }
  };

  const flush = async () => {
    for (const session of sessions.values()) await persistSession(session);
  };
  const interval = setInterval(() => {
    void flush();
  }, flushMs);

  return {
    createSession(mode, workMapId) {
      const session = inner.createSession(mode, workMapId);
      sessions.set(session.id, session);
      void persistSession(session);
      return session;
    },
    getSession: (id) => sessions.get(id) ?? inner.getSession(id),
    saveWorkMap(map) {
      inner.saveWorkMap(map);
      void persistMap("draft", map);
    },
    getWorkMap: (id) => inner.getWorkMap(id),
    publishWorkMap(map) {
      inner.publishWorkMap(map);
      void persistMap("published", map);
    },
    getPublishedWorkMap: () => inner.getPublishedWorkMap(),
    flush,
    async close() {
      clearInterval(interval);
      await flush();
    },
  };
}
