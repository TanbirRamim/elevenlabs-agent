/** Axis-aligned rectangle. The coordinate space is stated wherever a Rect is used. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Number of columns / rows of the dHash downsample (9x8 gray → 8x8 = 64 bits). */
export const GRAY_COLS = 9;
export const GRAY_ROWS = 8;

/** One captured screen frame, before it is hashed and sent. */
export interface Frame {
  jpegBase64: string;
  width: number;
  height: number;
  /** Grayscale 9x8 downsample, row-major, for `dhashFromGray`. */
  gray: Uint8ClampedArray;
}
