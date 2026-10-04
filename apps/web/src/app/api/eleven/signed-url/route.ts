import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/env";
import { voiceAccessPlan } from "@/lib/voice/access";

const Query = z.object({ agent: z.enum(["interviewer", "tutor"]) });

/**
 * Returns how the browser may open an ElevenAgents conversation: a short-lived signed URL
 * when the server holds an API key (which never leaves the server), otherwise the public
 * agent id, guarded by the agent's host allowlist in ElevenLabs.
 */
export async function GET(req: Request) {
  const serverEnv = getServerEnv();
  if (!serverEnv.success) {
    return NextResponse.json({ code: "eleven_not_configured" }, { status: 503 });
  }
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ code: "bad_agent" }, { status: 400 });

  const plan = voiceAccessPlan(serverEnv.data, q.data.agent);
  if (plan.kind === "public") return NextResponse.json({ agentId: plan.agentId });

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(plan.agentId)}`,
    { headers: { "xi-api-key": plan.apiKey }, cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json({ code: "eleven_upstream", status: res.status }, { status: 502 });
  }
  const body = z.object({ signed_url: z.string().url() }).parse(await res.json());
  return NextResponse.json({ signedUrl: body.signed_url });
}
