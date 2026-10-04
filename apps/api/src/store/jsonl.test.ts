import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMockFixtures } from "../mock/fixtures.js";
import { createMemoryObjectStorage } from "../storage/memory.js";
import type { ObjectStorage } from "../storage/types.js";
import { createJsonlStore, type PersistentStore } from "./jsonl.js";

const dirs: string[] = [];
const stores: PersistentStore[] = [];

function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "shadow-jsonl-"));
  dirs.push(d);
  return d;
}

async function tempStore(dir?: string, storage?: ObjectStorage) {
  const d = dir ?? tempDir();
  const store = await createJsonlStore({ dir: d, storage: storage ?? null, flushMs: 60_000 });
  stores.push(store);
  return { dir: d, store };
}

afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("jsonl store", () => {
  it("a session and the published map survive a restart", async () => {
    const { dir, store } = await tempStore();
    const session = store.createSession("capture", "wm_mock_1");
    session.transcript.push({
      id: "seg_1",
      tStartMs: 1000,
      tEndMs: 2000,
      speaker: "expert",
      text: "persisted line",
      offRecord: false,
    });
    session.storedFrameIds.push("f_1");
    const map = loadMockFixtures().workMap;
    store.saveWorkMap(map);
    store.publishWorkMap(map);
    await store.close();

    const { store: reborn } = await tempStore(dir);
    const revived = reborn.getSession(session.id);
    expect(revived).toBeDefined();
    expect(revived?.mode).toBe("capture");
    expect(revived?.workMapId).toBe("wm_mock_1");
    expect(revived?.transcript[0]?.text).toBe("persisted line");
    expect(revived?.storedFrameIds).toEqual(["f_1"]);
    expect(revived?.createdAt).toBeInstanceOf(Date);
    expect(reborn.getWorkMap(map.id)?.id).toBe(map.id);
    expect(reborn.getPublishedWorkMap()?.id).toBe(map.id);
  });

  it("guard verdicts survive a restart, and older snapshots replay with none", async () => {
    const { dir, store } = await tempStore();
    const session = store.createSession("teach", "wm_mock_1");
    session.guardVerdicts.push({
      ticketId: "N1",
      outcome: "refund",
      verdict: { decision: "BLOCK", ruleIds: ["G4"], source: "llm_judge" },
      at: 5000,
    });
    await store.close();
    // A snapshot written before guardVerdicts existed must still load.
    const old = { ...session, id: "sess_old" } as Partial<typeof session>;
    delete old.guardVerdicts;
    appendFileSync(
      join(dir, "sessions", "sess_old.jsonl"),
      `${JSON.stringify({ kind: "session", data: old })}\n`,
    );

    const { store: reborn } = await tempStore(dir);
    expect(reborn.getSession(session.id)?.guardVerdicts).toEqual(session.guardVerdicts);
    expect(reborn.getSession("sess_old")?.guardVerdicts).toEqual([]);
  });

  it("flush only appends when a session actually changed", async () => {
    const { dir, store } = await tempStore();
    const session = store.createSession("capture");
    await store.flush();
    await store.flush();
    session.transcript.push({
      id: "seg_2",
      tStartMs: 1,
      tEndMs: 2,
      speaker: "expert",
      text: "x",
      offRecord: false,
    });
    await store.flush();
    const lines = readFileSync(join(dir, "sessions", `${session.id}.jsonl`), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2); // create + one change
  });

  it("mirrors snapshots to object storage when configured", async () => {
    const storage = createMemoryObjectStorage();
    const { store } = await tempStore(undefined, storage);
    const session = store.createSession("teach");
    store.publishWorkMap(loadMockFixtures().workMap);
    await store.flush();
    expect(storage.objects.has(`state/sessions/${session.id}.json`)).toBe(true);
    expect([...storage.objects.keys()].some((k) => k.startsWith("state/workmaps/published-"))).toBe(
      true,
    );
  });

  it("a torn or invalid last line falls back to the last good snapshot", async () => {
    const { dir, store } = await tempStore();
    const session = store.createSession("capture");
    session.storedFrameIds.push("f_good");
    await store.close();
    const file = join(dir, "sessions", `${session.id}.jsonl`);
    // A valid-JSON line with the wrong shape, then a write cut off by a crash.
    appendFileSync(file, `${JSON.stringify({ kind: "session", data: { id: session.id } })}\n`);
    appendFileSync(file, '{"kind":"session","data":{"id":"');

    const { store: reborn } = await tempStore(dir);
    expect(reborn.getSession(session.id)?.storedFrameIds).toEqual(["f_good"]);
  });

  it("a file with no valid snapshot is skipped, not half-loaded", async () => {
    const { dir, store } = await tempStore();
    const session = store.createSession("capture");
    await store.close();
    const file = join(dir, "sessions", "ses_bad.jsonl");
    appendFileSync(file, `${JSON.stringify({ kind: "session", data: { id: "ses_bad" } })}\n`);

    const { store: reborn } = await tempStore(dir);
    expect(reborn.getSession("ses_bad")).toBeUndefined();
    expect(reborn.getSession(session.id)).toBeDefined();
  });

  it("restores sessions and maps from object storage when the local disk was wiped", async () => {
    const storage = createMemoryObjectStorage();
    const { store } = await tempStore(undefined, storage);
    const session = store.createSession("capture", "wm_mock_1");
    session.storedFrameIds.push("f_1");
    const map = loadMockFixtures().workMap;
    store.saveWorkMap(map);
    store.publishWorkMap(map);
    await store.close();

    const { store: reborn } = await tempStore(tempDir(), storage);
    expect(reborn.getSession(session.id)?.storedFrameIds).toEqual(["f_1"]);
    expect(reborn.getSession(session.id)?.createdAt).toBeInstanceOf(Date);
    expect(reborn.getWorkMap(map.id)?.id).toBe(map.id);
    expect(reborn.getPublishedWorkMap()?.id).toBe(map.id);
  });

  it("the mirror index keeps maps the local disk replayed", async () => {
    const storage = createMemoryObjectStorage();
    const map = loadMockFixtures().workMap;
    const { dir, store } = await tempStore(undefined, storage);
    store.saveWorkMap(map);
    await store.close();
    const { store: second } = await tempStore(dir, storage);
    second.saveWorkMap({ ...map, id: "wm_second" });
    await second.close();

    const { store: reborn } = await tempStore(tempDir(), storage);
    expect(reborn.getWorkMap(map.id)?.id).toBe(map.id);
    expect(reborn.getWorkMap("wm_second")?.id).toBe("wm_second");
  });

  it("a failing background flush is logged, not an unhandled rejection", async () => {
    const dir = tempDir();
    const warnings: string[] = [];
    const store = await createJsonlStore({
      dir,
      flushMs: 5,
      log: { warn: (_obj, msg) => warnings.push(msg) },
    });
    const session = store.createSession("capture");
    rmSync(dir, { recursive: true, force: true }); // the disk goes away under us
    session.storedFrameIds.push("f_1");
    await new Promise((r) => setTimeout(r, 30));
    expect(warnings).toContain("session flush failed");
    await store.close().catch(() => {});
  });

  it("close waits for slow mirror writes, and a slow older write never overwrites a newer one", async () => {
    const inner = createMemoryObjectStorage();
    let calls = 0;
    const slow: ObjectStorage = {
      async put(key, body, contentType) {
        // The first put is the slowest, so an unordered mirror would land it last.
        const delay = Math.max(0, 40 - 20 * calls++);
        await new Promise((r) => setTimeout(r, delay));
        await inner.put(key, body, contentType);
      },
      get: (key, range) => inner.get(key, range),
    };
    const { store } = await tempStore(undefined, slow);
    const session = store.createSession("capture");
    session.storedFrameIds.push("f_latest");
    store.publishWorkMap(loadMockFixtures().workMap);
    await store.close();
    expect([...inner.objects.keys()].some((k) => k.startsWith("state/workmaps/published-"))).toBe(
      true,
    );

    await new Promise((r) => setTimeout(r, 60)); // let any stray write land
    const mirrored = inner.objects.get(`state/sessions/${session.id}.json`);
    expect(JSON.parse(mirrored?.body.toString("utf8") ?? "{}").storedFrameIds).toEqual([
      "f_latest",
    ]);
  });
});
