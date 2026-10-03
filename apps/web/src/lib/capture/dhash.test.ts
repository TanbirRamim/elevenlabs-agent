import { describe, expect, it } from "vitest";
import { dhashFromGray, hamming, toGray9x8 } from "./dhash";
import { GRAY_COLS, GRAY_ROWS } from "./types";

/** A 36x24 RGBA image whose gray level follows `f(x, y)`. */
function image(width: number, height: number, f: (x: number, y: number) => number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = f(x, y);
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// Mid-range, non-monotone texture so no two neighbouring cells are equal.
const texture = (x: number, y: number) => 60 + ((x * 37 + y * 11 + ((x * y) % 7) * 13) % 120);

describe("toGray9x8", () => {
  it("produces 72 values and averages a flat image exactly", () => {
    const g = toGray9x8(
      image(36, 24, () => 100),
      36,
      24,
    );
    expect(g.length).toBe(GRAY_COLS * GRAY_ROWS);
    expect(Array.from(g).every((v) => v === 100)).toBe(true);
  });

  it("keeps a horizontal gradient increasing from left to right", () => {
    const g = toGray9x8(
      image(90, 16, (x) => x * 2),
      90,
      16,
    );
    for (let c = 1; c < GRAY_COLS; c++) expect(g[c] ?? 0).toBeGreaterThan(g[c - 1] ?? 0);
  });

  it("handles sizes smaller than 9x8 without throwing", () => {
    const g = toGray9x8(
      image(3, 2, () => 50),
      3,
      2,
    );
    expect(g.length).toBe(72);
    expect(g[0]).toBe(50);
  });
});

describe("dhashFromGray", () => {
  const base = toGray9x8(image(36, 24, texture), 36, 24);

  it("is 16 lowercase hex chars", () => {
    expect(dhashFromGray(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("gives distance 0 for identical images", () => {
    const again = toGray9x8(image(36, 24, texture), 36, 24);
    expect(hamming(dhashFromGray(base), dhashFromGray(again))).toBe(0);
  });

  it("gives a large distance for an inverted image", () => {
    const inverted = toGray9x8(
      image(36, 24, (x, y) => 255 - texture(x, y)),
      36,
      24,
    );
    expect(hamming(dhashFromGray(base), dhashFromGray(inverted))).toBeGreaterThanOrEqual(40);
  });

  it("gives a large distance for a horizontally flipped image", () => {
    const flipped = toGray9x8(
      image(36, 24, (x, y) => texture(35 - x, y)),
      36,
      24,
    );
    expect(hamming(dhashFromGray(base), dhashFromGray(flipped))).toBeGreaterThan(20);
  });

  it("gives a small distance for a tiny brightness shift", () => {
    const brighter = toGray9x8(
      image(36, 24, (x, y) => texture(x, y) + 4),
      36,
      24,
    );
    expect(hamming(dhashFromGray(base), dhashFromGray(brighter))).toBeLessThan(6);
  });

  it("rejects buffers of the wrong size", () => {
    expect(() => dhashFromGray(new Uint8ClampedArray(64))).toThrow(RangeError);
  });
});

describe("hamming", () => {
  it("counts differing bits of known hex strings", () => {
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("00", "0f")).toBe(4);
    expect(hamming("a5", "5a")).toBe(8);
    expect(hamming("ab", "ad")).toBe(2);
  });

  it("rejects mismatched lengths and non-hex input", () => {
    expect(() => hamming("00", "000")).toThrow(RangeError);
    expect(() => hamming("zz", "00")).toThrow(RangeError);
  });
});
