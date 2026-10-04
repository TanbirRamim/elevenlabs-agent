import { describe, expect, it } from "vitest";
import { fitRect, toOutput } from "./redactedStream";

describe("fitRect", () => {
  it("fills the output when aspect ratios match", () => {
    expect(fitRect({ w: 640, h: 360 }, { w: 1280, h: 720 })).toEqual({
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
    });
  });

  it("letterboxes a taller source and centers it", () => {
    expect(fitRect({ w: 500, h: 500 }, { w: 1280, h: 720 })).toEqual({
      x: 280,
      y: 0,
      w: 720,
      h: 720,
    });
  });

  it("returns an empty rect for an empty source", () => {
    expect(fitRect({ w: 0, h: 100 }, { w: 1280, h: 720 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("toOutput", () => {
  it("maps a PII rect from crop space into the letterboxed output", () => {
    const crop = { w: 500, h: 500 };
    const fitted = fitRect(crop, { w: 1280, h: 720 });
    const o = toOutput({ x: 100, y: 50, w: 200, h: 20 }, crop, fitted);
    expect(o.x).toBeCloseTo(424);
    expect(o.y).toBeCloseTo(72);
    expect(o.w).toBeCloseTo(288);
    expect(o.h).toBeCloseTo(28.8);
  });
});
