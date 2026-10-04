import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSeedDir } from "@shadow/guard/fixtures";
import { WorkMap } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { restoreBootState } from "./boot.js";
import { loadEnv } from "./env.js";
import { createMemoryObjectStorage } from "./storage/memory.js";
import { createMemoryStore } from "./store/memory.js";

const fixtureMap = WorkMap.parse(
  JSON.parse(readFileSync(join(findSeedDir(), "fixtures", "workmap.json"), "utf8")),
);
const WEBM = Buffer.from("0123456789abcdef");

function bootDir(map: unknown = { ...fixtureMap, sourceSessionId: "ses_boot1" }) {
  const dir = mkdtempSync(join(tmpdir(), "shadow-boot-"));
  writeFileSync(join(dir, "workmap.json"), JSON.stringify(map));
  mkdirSync(join(dir, "recordings"));
  writeFileSync(join(dir, "recordings", "ses_boot1.webm"), WEBM);
  return dir;
}

function deps(dir: string | undefined) {
  const log = { info: vi.fn(), warn: vi.fn() };
  return { dir, store: createMemoryStore(), storage: createMemoryObjectStorage(), log };
}

describe("restoreBootState", () => {
  it("publishes the boot map and restores its recording", async () => {
    const d = deps(bootDir());
    const result = await restoreBootState(d);
    expect(result).toEqual({ publishedMapId: fixtureMap.id, restoredRecordings: ["ses_boot1"] });
    expect(d.store.getPublishedWorkMap()?.id).toBe(fixtureMap.id);
    expect(d.store.getWorkMap(fixtureMap.id)?.id).toBe(fixtureMap.id);
    expect(d.storage.objects.get("recordings/ses_boot1.webm")?.body.equals(WEBM)).toBe(true);
    expect(d.log.info).toHaveBeenCalledWith(
      { workMapId: fixtureMap.id, version: fixtureMap.version },
      "boot map published",
    );
  });

  it("never replaces a published map or an existing recording", async () => {
    const d = deps(bootDir());
    const live = { ...fixtureMap, id: "wm_live", version: 3 };
    d.store.publishWorkMap(live);
    await d.storage.put("recordings/ses_boot1.webm", Buffer.from("live"), "video/webm");
    const result = await restoreBootState(d);
    expect(result).toEqual({ publishedMapId: null, restoredRecordings: [] });
    expect(d.store.getPublishedWorkMap()?.id).toBe("wm_live");
    expect(d.storage.objects.get("recordings/ses_boot1.webm")?.body.toString()).toBe("live");
  });

  it("rejects an invalid map with a warning and still restores recordings", async () => {
    // A step citing a guardrail that does not exist fails the WorkMap evidence refine.
    const [step] = fixtureMap.steps;
    const broken = { ...fixtureMap, steps: [{ ...step, guardrailIds: ["gr_missing"] }] };
    const d = deps(bootDir(broken));
    const result = await restoreBootState(d);
    expect(result.publishedMapId).toBeNull();
    expect(d.store.getPublishedWorkMap()).toBeUndefined();
    expect(d.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("gr_missing") }),
      "boot map rejected",
    );
    expect(result.restoredRecordings).toEqual(["ses_boot1"]);
  });

  it("does nothing when SHADOW_BOOT_DIR is unset or empty", async () => {
    for (const dir of [undefined, ""]) {
      const d = deps(dir);
      expect(await restoreBootState(d)).toEqual({ publishedMapId: null, restoredRecordings: [] });
      expect(d.storage.objects.size).toBe(0);
      expect(d.log.info).not.toHaveBeenCalled();
      expect(d.log.warn).not.toHaveBeenCalled();
    }
  });

  it("skips files that are not <sessionId>.webm", async () => {
    const dir = bootDir();
    writeFileSync(join(dir, "recordings", "clip.mp4"), WEBM);
    const d = deps(dir);
    const result = await restoreBootState(d);
    expect(result.restoredRecordings).toEqual(["ses_boot1"]);
    expect(d.log.warn).toHaveBeenCalledWith({ file: "clip.mp4" }, expect.any(String));
  });

  it("serves the restored clip although its session is gone, and the API starts", async () => {
    const d = deps(bootDir());
    await restoreBootState(d);
    const env = loadEnv({ NODE_ENV: "test" });
    const app = await buildApp({ env, store: d.store, storage: d.storage });
    const published = await app.inject({ method: "GET", url: "/workmaps/published" });
    expect(published.json<WorkMap>().id).toBe(fixtureMap.id);
    const clip = await app.inject({
      method: "GET",
      url: "/sessions/ses_boot1/recording",
      headers: { range: "bytes=0-3" },
    });
    expect(clip.statusCode).toBe(206);
    expect(clip.body).toBe("0123");
    const other = await app.inject({ method: "GET", url: "/sessions/ses_other/recording" });
    expect(other.statusCode).toBe(404);
  });
});
