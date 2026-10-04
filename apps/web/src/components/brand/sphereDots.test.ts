import { describe, expect, it } from "vitest";
import { inSmile, MARK_DOTS, sphereDots } from "./sphereDots";

describe("sphereDots", () => {
  const dots = sphereDots();
  const points = Array.from({ length: dots.length / 3 }, (_, i) => ({
    x: dots[i * 3] ?? 0,
    y: dots[i * 3 + 1] ?? 0,
    z: dots[i * 3 + 2] ?? 0,
  }));

  it("puts every dot on the unit sphere", () => {
    for (const p of points) expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 5);
  });

  it("lays dots out in the configured number of rows", () => {
    const rows = new Set(points.map((p) => p.y.toFixed(4)));
    expect(rows.size).toBe(MARK_DOTS.rows);
  });

  it("leaves the smile gap empty on the front face only", () => {
    expect(points.some((p) => inSmile(p.x, p.y, p.z))).toBe(false);
    expect(inSmile(0, -0.4, 0.9)).toBe(true);
    expect(inSmile(0, -0.4, -0.9)).toBe(false);
    expect(inSmile(0, 0.2, 0.97)).toBe(false);
    // Dots exist above and below the gap at the centre, so it reads as a mouth, not an edge.
    const front = points.filter((p) => p.z > 0.6 && Math.abs(p.x) < 0.1);
    expect(front.some((p) => p.y < -0.5)).toBe(true);
    expect(front.some((p) => p.y > -0.3)).toBe(true);
  });
});
