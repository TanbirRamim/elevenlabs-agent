import { describe, expect, it } from "vitest";
import { VoiceAccess, voiceAccessPlan } from "./access";

const ids = {
  ELEVENLABS_INTERVIEWER_AGENT_ID: "agent_interviewer",
  ELEVENLABS_TUTOR_AGENT_ID: "agent_tutor",
};

describe("voiceAccessPlan", () => {
  it("signs a URL when the server has an API key", () => {
    expect(voiceAccessPlan({ ...ids, ELEVENLABS_API_KEY: "k" }, "tutor")).toEqual({
      kind: "sign",
      agentId: "agent_tutor",
      apiKey: "k",
    });
  });

  it("falls back to the public agent id without a key", () => {
    expect(voiceAccessPlan(ids, "interviewer")).toEqual({
      kind: "public",
      agentId: "agent_interviewer",
    });
  });
});

describe("VoiceAccess", () => {
  it("accepts either a signed URL or an agent id, nothing else", () => {
    expect(VoiceAccess.safeParse({ signedUrl: "wss://example.test/x" }).success).toBe(true);
    expect(VoiceAccess.safeParse({ agentId: "agent_1" }).success).toBe(true);
    expect(VoiceAccess.safeParse({ signedUrl: "not a url" }).success).toBe(false);
    expect(VoiceAccess.safeParse({}).success).toBe(false);
  });
});
