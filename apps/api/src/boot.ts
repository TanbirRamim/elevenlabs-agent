import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkMap } from "@shadow/schema";
import type { ObjectStorage } from "./storage/types.js";
import type { Store } from "./store/memory.js";

/** A recording file name is the capture session id it belongs to (same charset as session ids). */
const RECORDING_FILE = /^([A-Za-z0-9_-]{1,64})\.webm$/;

export interface BootStateDeps {
  /** SHADOW_BOOT_DIR; nothing happens when unset. */
  dir: string | undefined;
  store: Store;
  storage: ObjectStorage | null;
  log: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
  };
}

export interface BootStateResult {
  publishedMapId: string | null;
  restoredRecordings: string[];
}

function readMap(file: string): { map: WorkMap } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { error: `unreadable JSON: ${String(err)}` };
  }
  const parsed = WorkMap.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { map: parsed.data };
}

/**
 * Restores the committed demo state after a wiped disk (the Hugging Face Space resets its disk
 * on every restart and wake). From `dir`:
 * - `workmap.json` is validated (WorkMap schema and its evidence checks), saved and published,
 *   but only when the store has no published map, so a map published during this uptime (or
 *   replayed from the JSONL state) always wins;
 * - every `recordings/<sessionId>.webm` is put into object storage under the key the recording
 *   route reads, unless that key already holds an object.
 * Never throws: a bad boot dir is logged and the API starts without it.
 */
export async function restoreBootState({
  dir,
  store,
  storage,
  log,
}: BootStateDeps): Promise<BootStateResult> {
  const result: BootStateResult = { publishedMapId: null, restoredRecordings: [] };
  if (!dir) return result;
  if (!existsSync(dir)) {
    log.warn({ dir }, "boot dir missing, nothing restored");
    return result;
  }

  const mapFile = join(dir, "workmap.json");
  const current = store.getPublishedWorkMap();
  if (current) {
    log.info({ workMapId: current.id }, "boot map skipped: a map is already published");
  } else if (existsSync(mapFile)) {
    const read = readMap(mapFile);
    if ("error" in read) {
      log.warn({ file: mapFile, error: read.error }, "boot map rejected");
    } else {
      store.saveWorkMap(read.map);
      store.publishWorkMap(read.map);
      result.publishedMapId = read.map.id;
      log.info({ workMapId: read.map.id, version: read.map.version }, "boot map published");
    }
  }

  const recordingsDir = join(dir, "recordings");
  if (existsSync(recordingsDir)) {
    const files = readdirSync(recordingsDir).filter((f) => !f.startsWith("."));
    if (files.length > 0 && !storage) {
      log.warn({ count: files.length }, "boot recordings skipped: no object storage");
      return result;
    }
    for (const file of files) {
      const sessionId = RECORDING_FILE.exec(file)?.[1];
      if (!sessionId || !storage) {
        log.warn({ file }, "boot recording skipped: expected <sessionId>.webm");
        continue;
      }
      const key = `recordings/${sessionId}.webm`;
      try {
        const existing = await storage.get(key, "bytes=0-0");
        if (existing.status === 200 || existing.status === 206) {
          // Drain the probe so a file handle or socket is not left open.
          if (!Buffer.isBuffer(existing.body)) existing.body.resume();
          continue;
        }
        await storage.put(key, readFileSync(join(recordingsDir, file)), "video/webm");
        result.restoredRecordings.push(sessionId);
      } catch (err) {
        log.warn({ sessionId, err: String(err) }, "boot recording restore failed");
      }
    }
    if (result.restoredRecordings.length > 0) {
      log.info({ sessionIds: result.restoredRecordings }, "boot recordings restored");
    }
  }
  return result;
}
