export type OrbState = "idle" | "listening" | "speaking" | "off-record";

export const ORB_STATES: readonly OrbState[] = ["idle", "listening", "speaking", "off-record"];

/** What the orb means, in words. Used for aria labels and visible captions. */
export const ORB_STATE_LABEL: Record<OrbState, string> = {
  idle: "Shadow is quiet",
  listening: "Shadow is listening",
  speaking: "Shadow is asking",
  "off-record": "Off the record",
};

export type OrbTone = "ink" | "signal" | "faint";

export type OrbParams = {
  /** Radial displacement of the shell, as a fraction of the radius. */
  amplitude: number;
  /** How much the audio level adds to the amplitude. */
  levelGain: number;
  /** Speed of the surface field. 0 means still. */
  speed: number;
  /** Mix from the ink colour (0) to the signal colour (1). Off the record ignores it. */
  signal: number;
  /** Point opacity. */
  opacity: number;
};

export const ORB_PARAMS: Record<OrbState, OrbParams> = {
  idle: { amplitude: 0.03, levelGain: 0, speed: 0.28, signal: 0, opacity: 0.62 },
  listening: { amplitude: 0.05, levelGain: 0.14, speed: 0.55, signal: 0.85, opacity: 0.85 },
  speaking: { amplitude: 0.08, levelGain: 0.2, speed: 0.9, signal: 1, opacity: 0.95 },
  "off-record": { amplitude: 0, levelGain: 0, speed: 0, signal: 0, opacity: 0.4 },
};

/** Evenly spread points on a unit sphere (Fibonacci lattice). Deterministic, so SSR-safe. */
export function fibonacciSphere(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    out[i * 3] = Math.cos(theta) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(theta) * r;
  }
  return out;
}

/** Clamp an audio level into 0..1; anything non-finite counts as silence. */
export function clampLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}
