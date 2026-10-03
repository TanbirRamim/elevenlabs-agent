import { z } from "zod";

const ServerEnv = z.object({
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_INTERVIEWER_AGENT_ID: z.string().min(1),
  ELEVENLABS_TUTOR_AGENT_ID: z.string().min(1),
});

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
};
