/**
 * Geometry for the Singoda AI mark as a 3D dot sphere: rows of dots on circles of latitude,
 * evenly spaced along each row, with the "smile" band of the mark left empty on the front face.
 *
 * Coordinates are on the unit sphere, +y up and +z towards the viewer at rest. Pure, so it is
 * unit-tested and shared by the hero canvas.
 */

export type SphereDotsOptions = {
  /** Number of rows, evenly spaced in y between the poles. */
  rows: number;
  /** Spacing between neighbouring dots along a row, as an arc length on the unit sphere. */
  spacing: number;
  /** Highest |y| a row may sit at; keeps the polar caps from crowding into a single dot. */
  maxY: number;
};

export const MARK_DOTS: SphereDotsOptions = { rows: 13, spacing: 0.15, maxY: 0.88 };

/**
 * The smile: an upward arc in the lower third of the front face, y = SMILE_Y + SMILE_CURVE·x²,
 * spanning |x| ≤ SMILE_HALF_WIDTH. Dots within SMILE_BAND of that arc are left out.
 */
const SMILE_Y = -0.4;
const SMILE_CURVE = 0.42;
const SMILE_HALF_WIDTH = 0.6;
const SMILE_BAND = 0.075;

/** Whether a point on the unit sphere falls in the mark's smile gap. */
export function inSmile(x: number, y: number, z: number): boolean {
  if (z <= 0 || Math.abs(x) > SMILE_HALF_WIDTH) return false;
  return Math.abs(y - (SMILE_Y + SMILE_CURVE * x * x)) < SMILE_BAND;
}

/** Flat xyz positions of every dot on the sphere, smile gap removed. */
export function sphereDots(options: SphereDotsOptions = MARK_DOTS): Float32Array {
  const { rows, spacing, maxY } = options;
  const out: number[] = [];
  for (let i = 0; i < rows; i++) {
    const y = rows === 1 ? 0 : -maxY + (2 * maxY * i) / (rows - 1);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const count = Math.max(1, Math.round((2 * Math.PI * ring) / spacing));
    // Every row has a dot at x = 0, so the centre column lines up as it does in the mark.
    for (let k = 0; k < count; k++) {
      const a = (2 * Math.PI * k) / count;
      const x = ring * Math.sin(a);
      const z = ring * Math.cos(a);
      if (inSmile(x, y, z)) continue;
      out.push(x, y, z);
    }
  }
  return new Float32Array(out);
}
