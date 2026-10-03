import { z } from "zod";

/** Server-only env for route handlers. Browser code reads NEXT_PUBLIC_* via publicEnv. */
export const serverEnv = z
  .object({
    ELEVENLABS_API_KEY: z.string().min(1),
    ELEVENLABS_INTERVIEWER_AGENT_ID: z.string().min(1),
    ELEVENLABS_TUTOR_AGENT_ID: z.string().min(1),
  })
  .safeParse(process.env);

export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  apiWsUrl: process.env.NEXT_PUBLIC_API_WS_URL ?? "ws://localhost:4000",
};
