import type { WorkMap } from "@shadow/schema";
import { publicEnv } from "../../env";
// Relative, not "@/lib/api": vitest has no "@/" alias and WorkMapView.test imports this file.
import {
  ApiClientError,
  getPublishedWorkMap,
  getWorkMap,
  patchWorkMap,
  publishWorkMap,
  recordingUrl,
  type WorkMapPatchInput,
} from "../../lib/api";
import { sampleWorkMap } from "./fixture";

/**
 * Work Map data access on top of the shared API client (`lib/api.ts`). The only logic
 * kept here is the page's fallback rule: the sample map is shown when forced or when the
 * API cannot be reached at all.
 */

export { patchWorkMap, publishWorkMap, recordingUrl, type WorkMapPatchInput };

export type LoadResult =
  | { source: "api"; map: WorkMap }
  | { source: "fixture"; map: WorkMap; reason: "forced" | "unreachable" };

/**
 * `GET /sessions/:id/frames/:frameId.jpg` has no client method (it is an <img src> / poster),
 * so it is built here. Frame ids are per session: the API stores them under the session id.
 */
export function frameUrl(sessionId: string, frameId: string): string {
  const seg = encodeURIComponent;
  return `${publicEnv.apiUrl}/sessions/${seg(sessionId)}/frames/${seg(frameId)}.jpg`;
}

/**
 * Loads a map from the API ("latest" means the latest published map). Falls back to the
 * sample map only on a network error or when the caller forces it; an HTTP error or an
 * invalid body is thrown as an `ApiClientError`, never papered over.
 */
export async function loadWorkMap(
  id: string,
  opts: { forceFixture: boolean },
): Promise<LoadResult> {
  if (opts.forceFixture) return { source: "fixture", map: sampleWorkMap, reason: "forced" };
  try {
    const map = id === "latest" ? await getPublishedWorkMap() : await getWorkMap(id);
    return { source: "api", map };
  } catch (err) {
    if (err instanceof ApiClientError && err.kind === "network") {
      return { source: "fixture", map: sampleWorkMap, reason: "unreachable" };
    }
    throw err;
  }
}
