import { z } from "zod";

export type VoiceAgent = "interviewer" | "tutor";

/** What the browser needs to open a conversation, as returned by /api/eleven/signed-url. */
export const VoiceAccess = z.union([
  z.object({ signedUrl: z.string().url() }),
  z.object({ agentId: z.string().min(1) }),
]);
export type VoiceAccess = z.infer<typeof VoiceAccess>;

interface AccessEnv {
  ELEVENLABS_API_KEY?: string | undefined;
  ELEVENLABS_INTERVIEWER_AGENT_ID: string;
  ELEVENLABS_TUTOR_AGENT_ID: string;
}

/**
 * How a conversation is authorised. With an API key the server signs a short-lived URL
 * (agent authentication on). Without one the browser connects by agent id, which only works
 * for an agent whose authentication is off and whose host allowlist admits this site.
 */
export function voiceAccessPlan(
  env: AccessEnv,
  agent: VoiceAgent,
): { kind: "sign"; agentId: string; apiKey: string } | { kind: "public"; agentId: string } {
  const agentId =
    agent === "interviewer" ? env.ELEVENLABS_INTERVIEWER_AGENT_ID : env.ELEVENLABS_TUTOR_AGENT_ID;
  return env.ELEVENLABS_API_KEY
    ? { kind: "sign", agentId, apiKey: env.ELEVENLABS_API_KEY }
    : { kind: "public", agentId };
}
