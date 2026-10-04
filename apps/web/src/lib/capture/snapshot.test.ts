// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { captureFrame, scaleRect, videoToViewportScale } from "./snapshot";

describe("scaleRect", () => {
  it("scales each axis independently", () => {
    expect(scaleRect({ x: 10, y: 20, w: 100, h: 50 }, { x: 2, y: 0.5 })).toEqual({
      x: 20,
      y: 10,
      w: 200,
      h: 25,
    });
  });
});

describe("videoToViewportScale", () => {
  it("returns null until the video has dimensions", () => {
    const video = document.createElement("video");
    expect(videoToViewportScale(video, { width: 1000, height: 500 })).toBeNull();
  });

  it("divides video pixels by viewport pixels", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "videoWidth", { value: 2000 });
    Object.defineProperty(video, "videoHeight", { value: 1500 });
    expect(videoToViewportScale(video, { width: 1000, height: 500 })).toEqual({ x: 2, y: 3 });
  });
});

describe("captureFrame", () => {
  it("returns null for a video without a frame", () => {
    const video = document.createElement("video");
    expect(captureFrame(video, { blackout: [], maxWidth: 1280, quality: 0.7 })).toBeNull();
  });
});
