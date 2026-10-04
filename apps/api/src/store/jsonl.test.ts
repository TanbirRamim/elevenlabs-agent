import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMockFixtures } from "../mock/fixtures.js";
import { createJsonlStore, type PersistentStore } from "./jsonl.js";

const dirs: string[] = [];
const stores: PersistentStore[] = [];

function tempStore(dir?: string) {
  const d = dir ?? mkdtempSync(join(tmpdir(), "shadow-jsonl-"));
  if (!dir) dirs.push(d);
  const store = createJsonlStore({ dir: d, flushMs: 60_000 });
  stores.push(store);
  return { dir: d, store };
}

afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("jsonl store", () => {
  it("a session and the published map survive a restart", async () => {
    const { dir, store } = tempStore();
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

    const { store: reborn } = tempStore(dir);
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

  it("flush only appends when a session actually changed", async () => {
    const { dir, store } = tempStore();
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
    const { readFileSync } = await import("node:fs");
    const lines = readFileSync(join(dir, "sessions", `${session.id}.jsonl`), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2); // create + one change
  });

  it("mirrors snapshots to object storage when configured", async () => {
    const { createMemoryObjectStorage } = await import("../storage/memory.js");
    const storage = createMemoryObjectStorage();
    const d = mkdtempSync(join(tmpdir(), "shadow-jsonl-"));
    dirs.push(d);
    const store = createJsonlStore({ dir: d, storage, flushMs: 60_000 });
    stores.push(store);
    const session = store.createSession("teach");
    store.publishWorkMap(loadMockFixtures().workMap);
    await store.flush();
    await new Promise((r) => setTimeout(r, 10));
    expect(storage.objects.has(`state/sessions/${session.id}.json`)).toBe(true);
    expect([...storage.objects.keys()].some((k) => k.startsWith("state/workmaps/published-"))).toBe(
      true,
    );
  });
});
