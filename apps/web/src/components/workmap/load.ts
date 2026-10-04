import type { ScreenMoment, WorkMap } from "@shadow/schema";
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

/**
 * The capture session whose recording and frames back a map's clips: an explicit id from the
 * URL (`?expertSession=` in Teach, `?session=` on the Work Map) wins, then the map's own
 * `sourceSessionId`, which maps built from a live capture carry. Null means nothing to replay.
 */
export function resolveExpertSession(
  explicitId: string | null | undefined,
  map: Pick<WorkMap, "sourceSessionId"> | null | undefined,
): string | null {
  const id = explicitId?.trim();
  if (id) return id;
  return map?.sourceSessionId ?? null;
}

/** Every screen moment a map cites (steps and guardrail evidence), one per frame id. */
export function mapMoments(map: WorkMap | null | undefined): ScreenMoment[] {
  if (!map) return [];
  const byFrame = new Map<string, ScreenMoment>();
  for (const s of map.steps)
    if (!byFrame.has(s.moment.frameId)) byFrame.set(s.moment.frameId, s.moment);
  for (const g of map.guardrails) {
    const m = g.evidence.moment;
    if (!byFrame.has(m.frameId)) byFrame.set(m.frameId, m);
  }
  return [...byFrame.values()];
}

/** How far either side of a moment a frame may sit and still belong to its slideshow. */
export const SLIDESHOW_WINDOW_MS = 30_000;
const SLIDESHOW_MAX_FRAMES = 6;

/**
 * The redacted frames to show, in time order, when a moment has no recording: the moment's own
 * frame plus the other frames the map cites within `windowMs` of it (frame ids carry a perceptual
 * hash, so neighbours cannot be guessed, only taken from the map). The closest ones are kept.
 */
export function framesAroundMoment(
  moment: ScreenMoment,
  all: readonly ScreenMoment[],
  windowMs: number = SLIDESHOW_WINDOW_MS,
): { frameId: string; tMs: number }[] {
  const picked = new Map<string, number>([[moment.frameId, moment.tMs]]);
  const near = all
    .filter((m) => m.frameId !== moment.frameId && Math.abs(m.tMs - moment.tMs) <= windowMs)
    .sort((a, b) => Math.abs(a.tMs - moment.tMs) - Math.abs(b.tMs - moment.tMs));
  for (const m of near) {
    if (picked.size >= SLIDESHOW_MAX_FRAMES) break;
    if (!picked.has(m.frameId)) picked.set(m.frameId, m.tMs);
  }
  return [...picked.entries()]
    .map(([frameId, tMs]) => ({ frameId, tMs }))
    .sort((a, b) => a.tMs - b.tMs);
}

/** Whether the session recording loaded, failed, or has not answered yet. */
export type RecordingState = "pending" | "ok" | "missing";

/**
 * What a clip shows: the recording; a slideshow of stored frames when the recording is missing;
 * the expert's quote alone when there is no session or neither exists; "probing" while the
 * frames are still being checked after the recording failed.
 */
export type ReplayMode = "video" | "probing" | "slideshow" | "quote";

export function replayMode(input: {
  sessionId: string | null;
  recording: RecordingState;
  /** Stored frame ids that loaded, or "pending" while they are checked. */
  frames: readonly string[] | "pending";
}): ReplayMode {
  if (!input.sessionId) return "quote";
  if (input.recording !== "missing") return "video";
  if (input.frames === "pending") return "probing";
  return input.frames.length > 0 ? "slideshow" : "quote";
}
