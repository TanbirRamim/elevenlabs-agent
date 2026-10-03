import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/env";

const Query = z.object({ agent: z.enum(["interviewer", "tutor"]) });

/**
 * Returns a short-lived signed URL for an ElevenAgents conversation.
 * The ElevenLabs API key never leaves the server.
 */
export async function GET(req: Request) {
  if (!serverEnv.success) {
    return NextResponse.json({ code: "eleven_not_configured" }, { status: 503 });
  }
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ code: "bad_agent" }, { status: 400 });

  const env = serverEnv.data;
  const agentId =
    q.data.agent === "interviewer"
      ? env.ELEVENLABS_INTERVIEWER_AGENT_ID
      : env.ELEVENLABS_TUTOR_AGENT_ID;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json({ code: "eleven_upstream", status: res.status }, { status: 502 });
  }
  const body = z.object({ signed_url: z.string().url() }).parse(await res.json());
  return NextResponse.json({ signedUrl: body.signed_url });
}
