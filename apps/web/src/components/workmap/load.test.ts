import { describe, expect, it } from "vitest";
import { sampleWorkMap } from "./fixture";
import { framesAroundMoment, mapMoments, replayMode, resolveExpertSession } from "./load";

describe("resolveExpertSession", () => {
  it("prefers the explicit id from the URL", () => {
    expect(resolveExpertSession("sess_query", { sourceSessionId: "sess_map" })).toBe("sess_query");
  });

  it("falls back to the map's source session", () => {
    expect(resolveExpertSession(null, { sourceSessionId: "sess_map" })).toBe("sess_map");
    expect(resolveExpertSession("  ", { sourceSessionId: "sess_map" })).toBe("sess_map");
    expect(resolveExpertSession(undefined, { sourceSessionId: "sess_map" })).toBe("sess_map");
  });

  it("is null when neither exists (the sample map)", () => {
    expect(sampleWorkMap.sourceSessionId).toBeUndefined();
    expect(resolveExpertSession(null, sampleWorkMap)).toBeNull();
    expect(resolveExpertSession(null, null)).toBeNull();
  });
});

describe("framesAroundMoment", () => {
  const at = (frameId: string, tMs: number) => ({
    frameId,
    tMs,
    clip: [tMs, tMs] as [number, number],
  });

  it("keeps the moment's frame and the map's frames within the window, in time order", () => {
    const moment = at("f_b", 100_000);
    const all = [at("f_c", 120_000), moment, at("f_a", 80_000), at("f_far", 200_000)];
    expect(framesAroundMoment(moment, all).map((f) => f.frameId)).toEqual(["f_a", "f_b", "f_c"]);
  });

  it("shows the moment's own frame when nothing else is near", () => {
    const moment = at("f_1", 0);
    expect(framesAroundMoment(moment, [])).toEqual([{ frameId: "f_1", tMs: 0 }]);
  });

  it("dedupes the sample map's shared frames", () => {
    const moments = mapMoments(sampleWorkMap);
    expect(new Set(moments.map((m) => m.frameId)).size).toBe(moments.length);
  });
});

describe("replayMode", () => {
  it("shows the quote alone without a session", () => {
    expect(replayMode({ sessionId: null, recording: "pending", frames: "pending" })).toBe("quote");
  });

  it("plays the recording while it loads or once it has", () => {
    expect(replayMode({ sessionId: "s", recording: "pending", frames: "pending" })).toBe("video");
    expect(replayMode({ sessionId: "s", recording: "ok", frames: [] })).toBe("video");
  });

  it("falls back to stored frames, then to the quote, when the recording is missing", () => {
    expect(replayMode({ sessionId: "s", recording: "missing", frames: "pending" })).toBe("probing");
    expect(replayMode({ sessionId: "s", recording: "missing", frames: ["f_1"] })).toBe("slideshow");
    expect(replayMode({ sessionId: "s", recording: "missing", frames: [] })).toBe("quote");
  });
});
