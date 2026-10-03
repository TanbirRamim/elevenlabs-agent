import { GRAY_COLS, GRAY_ROWS } from "./types";

/**
 * 64-bit difference hash (dHash). Pure: no DOM, so it is unit-tested.
 * Input is a 9x8 grayscale image; each row yields 8 bits (left pixel < right pixel).
 */

const HEX = "0123456789abcdef";

/** Area-average an RGBA buffer of any size into a 9x8 grayscale buffer (row-major). */
export function toGray9x8(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(GRAY_COLS * GRAY_ROWS);
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return out;

  for (let row = 0; row < GRAY_ROWS; row++) {
    const y0 = Math.floor((row * height) / GRAY_ROWS);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * height) / GRAY_ROWS));
    for (let col = 0; col < GRAY_COLS; col++) {
      const x0 = Math.floor((col * width) / GRAY_COLS);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / GRAY_COLS));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        let i = (y * width + x0) * 4;
        for (let x = x0; x < x1 && x < width; x++, i += 4) {
          // Rec. 601 luma, unchecked indexes are in range because of the length guard above.
          sum += 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
          n++;
        }
      }
      out[row * GRAY_COLS + col] = n === 0 ? 0 : Math.round(sum / n);
    }
  }
  return out;
}

/** dHash of a 9x8 gray buffer as 16 lowercase hex chars (row 0 first, MSB = leftmost pair). */
export function dhashFromGray(gray: Uint8ClampedArray): string {
  if (gray.length !== GRAY_COLS * GRAY_ROWS) {
    throw new RangeError(
      `dhashFromGray expects ${GRAY_COLS * GRAY_ROWS} bytes, got ${gray.length}`,
    );
  }
  let hex = "";
  for (let row = 0; row < GRAY_ROWS; row++) {
    let byte = 0;
    const base = row * GRAY_COLS;
    for (let col = 0; col < GRAY_COLS - 1; col++) {
      const left = gray[base + col] ?? 0;
      const right = gray[base + col + 1] ?? 0;
      byte = (byte << 1) | (left < right ? 1 : 0);
    }
    hex += HEX[byte >> 4];
    hex += HEX[byte & 0xf];
  }
  return hex;
}

const POPCOUNT_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

/** Hamming distance between two equal-length hex strings (bits that differ). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new RangeError(`hamming: lengths differ (${a.length} vs ${b.length})`);
  }
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number.parseInt(a[i] ?? "0", 16);
    const y = Number.parseInt(b[i] ?? "0", 16);
    if (Number.isNaN(x) || Number.isNaN(y)) throw new RangeError("hamming: not a hex string");
    d += POPCOUNT_NIBBLE[(x ^ y) & 0xf] ?? 0;
  }
  return d;
}
