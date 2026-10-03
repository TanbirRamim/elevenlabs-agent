import { WorkMap, type WorkMapPatch } from "@shadow/schema";
import { z } from "zod";
import { publicEnv } from "../../env";
import { sampleWorkMap } from "./fixture";

/**
 * Local data access for the Work Map page. Deliberately small: `lib/api.ts` (TAN-2) is the
 * shared client; this file only covers the routes this page needs and parses every
 * response with the `@shadow/schema` contracts.
 */

export type WorkMapPatchInput = z.input<typeof WorkMapPatch>;

export type LoadResult =
  | { source: "api"; map: WorkMap }
  | { source: "fixture"; map: WorkMap; reason: "forced" | "unreachable" };

export class WorkMapLoadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "WorkMapLoadError";
  }
}

const PublishResponse = z.object({ id: z.string() });

export function workMapUrl(id: string): string {
  return id === "latest"
    ? `${publicEnv.apiUrl}/workmaps/published`
    : `${publicEnv.apiUrl}/workmaps/${encodeURIComponent(id)}`;
}

export function frameUrl(frameId: string): string {
  return `${publicEnv.apiUrl}/frames/${encodeURIComponent(frameId)}.jpg`;
}

export function recordingUrl(sessionId: string): string {
  return `${publicEnv.apiUrl}/sessions/${encodeURIComponent(sessionId)}/recording`;
}

async function parseResponse<T>(res: Response, schema: z.ZodType<T>, what: string): Promise<T> {
  if (!res.ok) {
    throw new WorkMapLoadError(`${what} failed with HTTP ${res.status}`, res.status);
  }
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new WorkMapLoadError(`${what} returned data that does not match the WorkMap contract`);
  }
  return parsed.data;
}

/**
 * Loads a map from the API. Falls back to the sample map only when the API cannot be
 * reached at all (network error) or when the caller forces it; an HTTP error or an
 * invalid body is reported, never papered over.
 */
export async function loadWorkMap(
  id: string,
  opts: { forceFixture: boolean },
): Promise<LoadResult> {
  if (opts.forceFixture) return { source: "fixture", map: sampleWorkMap, reason: "forced" };

  let res: Response;
  try {
    res = await fetch(workMapUrl(id), { headers: { accept: "application/json" } });
  } catch {
    return { source: "fixture", map: sampleWorkMap, reason: "unreachable" };
  }
  const map = await parseResponse(res, WorkMap, `Loading Work Map "${id}"`);
  return { source: "api", map };
}

export async function patchWorkMap(id: string, patch: WorkMapPatchInput): Promise<WorkMap> {
  const res = await fetch(`${publicEnv.apiUrl}/workmaps/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(patch),
  });
  return parseResponse(res, WorkMap, "Updating the Work Map");
}

export async function publishWorkMap(id: string): Promise<{ id: string }> {
  const res = await fetch(`${publicEnv.apiUrl}/workmaps/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    headers: { accept: "application/json" },
  });
  return parseResponse(res, PublishResponse, "Publishing the Work Map");
}
