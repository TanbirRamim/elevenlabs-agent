import { describe, expect, it } from "vitest";
import {
  easeOutCubic,
  MAX_DELTA,
  placeholderFade,
  REVEAL_TOTAL,
  revealDelays,
  revealFrontPercent,
  type Spring,
  smoothstep,
  springStep,
} from "./HeroSphere";
import { sphereDots } from "./sphereDots";

describe("HeroSphere motion helpers", () => {
  it("easeOutCubic runs 0 to 1, clamped, fast then settling", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
  });

  it("smoothstep is clamped and monotonic", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0, 1, 0.3)).toBeLessThan(smoothstep(0, 1, 0.6));
  });

  it("reveals the top row first and the bottom row last", () => {
    const dots = sphereDots();
    const delays = revealDelays(dots);
    expect(delays.length).toBe(dots.length / 3);
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < delays.length; i++) {
      const y = dots[i * 3 + 1] ?? 0;
      if (y > (dots[top * 3 + 1] ?? 0)) top = i;
      if (y < (dots[bottom * 3 + 1] ?? 0)) bottom = i;
      expect(delays[i]).toBeGreaterThanOrEqual(0);
      expect(delays[i]).toBeLessThanOrEqual(1);
    }
    expect(delays[top]).toBe(0);
    expect(delays[bottom]).toBe(1);
  });

  it("wipes the placeholder top to bottom, opaque at the start and gone at the end", () => {
    const start = placeholderFade(0);
    expect(start.opacity).toBe(1);
    // At t=0 the mask is fully opaque below the top edge of the dots.
    expect(revealFrontPercent(0) + 9).toBeLessThan(15);
    expect(revealFrontPercent(0.3)).toBeGreaterThan(revealFrontPercent(0.1));
    expect(placeholderFade(REVEAL_TOTAL).opacity).toBe(0);
    expect(start.mask).toMatch(
      /^linear-gradient\(to bottom, transparent -?[\d.]+%, #000 -?[\d.]+%\)$/,
    );
  });

  it("spring settles on the target without overshoot, independent of frame rate", () => {
    const run = (fps: number) => {
      const s: Spring = { x: 0, v: 0 };
      let peak = 0;
      for (let i = 0; i < fps * 3; i++) {
        springStep(s, 1, 1 / fps);
        peak = Math.max(peak, s.x);
      }
      return { x: s.x, peak };
    };
    const at30 = run(30);
    const at144 = run(144);
    expect(at30.x).toBeCloseTo(1, 2);
    expect(at144.x).toBeCloseTo(1, 2);
    expect(at30.peak).toBeLessThanOrEqual(1.001);
    expect(Math.abs(at30.x - at144.x)).toBeLessThan(0.01);
  });

  it("clamps a huge delta (tab resumed) to one small step", () => {
    const s: Spring = { x: 0, v: 0 };
    springStep(s, 1, 30);
    const t: Spring = { x: 0, v: 0 };
    springStep(t, 1, MAX_DELTA);
    expect(s.x).toBeCloseTo(t.x, 10);
    expect(s.x).toBeLessThan(0.1);
  });
});
