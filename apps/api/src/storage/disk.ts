import { createReadStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { parseRange } from "./range.js";
import type { ObjectStorage, StorageGetResult } from "./types.js";

/** Keys are "/"-separated segments of a safe charset: no "..", no absolute paths, no backslashes. */
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/** Maps a key to a file under root, or throws for anything that could escape it. */
function keyPath(root: string, key: string): string {
  const segments = key.split("/");
  if (segments.length === 0 || !segments.every((s) => SEGMENT.test(s) && !s.includes(".."))) {
    throw new Error(`unsafe storage key: ${JSON.stringify(key)}`);
  }
  const path = resolve(root, ...segments);
  if (!path.startsWith(root + sep)) throw new Error(`unsafe storage key: ${JSON.stringify(key)}`);
  return path;
}

/**
 * ObjectStorage on the local disk, for hosts without S3 (the Hugging Face Space). Objects
 * live as plain files under `dir`, so they survive API restarts but not a wiped container.
 * Reads stream from disk with the same Range semantics as S3. The content type is not
 * kept: every caller already knows what it stored under a key.
 */
export function createDiskStorage(dir: string): ObjectStorage {
  const root = resolve(dir);
  return {
    async put(key, body) {
      const path = keyPath(root, key);
      await mkdir(dirname(path), { recursive: true });
      // Write then rename, so a concurrent reader never sees a half-written object.
      const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, path);
    },
    async get(key, rangeHeader): Promise<StorageGetResult> {
      const path = keyPath(root, key);
      let size: number;
      try {
        const info = await stat(path);
        if (!info.isFile()) return { status: 404 };
        size = info.size;
      } catch {
        return { status: 404 };
      }
      if (!rangeHeader) {
        return { status: 200, body: createReadStream(path), contentLength: size };
      }
      const range = parseRange(rangeHeader, size);
      if (!range) return { status: 416 };
      return {
        status: 206,
        body: createReadStream(path, { start: range.start, end: range.end }),
        contentLength: range.end - range.start + 1,
        contentRange: `bytes ${range.start}-${range.end}/${size}`,
      };
    },
  };
}
