import { describe, expect, it } from "vitest";
import { endReasonForVoice, voiceHold } from "./lifecycle";

describe("voiceHold", () => {
  it("off the record holds the agent: mic muted, nothing heard or said", () => {
    expect(voiceHold({ offRecord: true, paused: false })).toBe(true);
  });
  it("paused holds the agent", () => {
    expect(voiceHold({ offRecord: false, paused: true })).toBe(true);
  });
  it("on the record and running does not", () => {
    expect(voiceHold({ offRecord: false, paused: false })).toBe(false);
  });
});

describe("endReasonForVoice", () => {
  it("ends a live capture when the agent hangs up", () => {
    expect(endReasonForVoice("capturing", "agent")).toBe("agent_ended");
  });
  it("ends a live capture when the voice connection fails", () => {
    expect(endReasonForVoice("capturing", "error")).toBe("voice_lost");
  });
  it("ignores the end of a call outside a live capture", () => {
    expect(endReasonForVoice("debrief", "agent")).toBeNull();
    expect(endReasonForVoice("processing", "error")).toBeNull();
    expect(endReasonForVoice("ready", "agent")).toBeNull();
  });
});
