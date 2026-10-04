import { z } from "zod";

const AgentIds = z.object({
  ELEVENLABS_INTERVIEWER_AGENT_ID: z.string().min(1),
  ELEVENLABS_TUTOR_AGENT_ID: z.string().min(1),
});

const ServerEnv = AgentIds.extend({
  /** Optional: with a key the browser gets a signed URL; without one it connects by agent id. */
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

/**
 * Server-only env for route handlers, read per request: on Cloudflare Workers the
 * bindings are populated into process.env at request time, not at module load.
 */
export function getServerEnv() {
  return ServerEnv.safeParse(process.env);
}

/** Inlined at build time; set NEXT_PUBLIC_* before `next build` / `cf:build`. */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  apiWsUrl: process.env.NEXT_PUBLIC_API_WS_URL ?? "ws://localhost:4000",
  /** Optional Spline scene for the landing hero (https only); the 3D orb is used when unset. */
  splineSceneUrl: process.env.NEXT_PUBLIC_SPLINE_SCENE_URL ?? "",
};
