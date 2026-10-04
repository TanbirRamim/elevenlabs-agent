import { parseRange } from "./range.js";
import type { ObjectStorage, StorageGetResult } from "./types.js";

export interface MemoryObjectStorage extends ObjectStorage {
  objects: Map<string, { body: Buffer; contentType: string }>;
}

/** In-memory ObjectStorage for tests: same Range semantics as S3. */
export function createMemoryObjectStorage(): MemoryObjectStorage {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async get(key, rangeHeader): Promise<StorageGetResult> {
      const obj = objects.get(key);
      if (!obj) return { status: 404 };
      if (!rangeHeader) return { status: 200, body: obj.body, contentLength: obj.body.length };
      const range = parseRange(rangeHeader, obj.body.length);
      if (!range) return { status: 416 };
      const slice = obj.body.subarray(range.start, range.end + 1);
      return {
        status: 206,
        body: slice,
        contentLength: slice.length,
        contentRange: `bytes ${range.start}-${range.end}/${obj.body.length}`,
      };
    },
  };
}
