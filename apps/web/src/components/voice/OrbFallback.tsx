import { cx } from "@/components/ui/cx";
import { fibonacciSphere, ORB_STATE_LABEL, type OrbState } from "./orbState";

const POINTS = (() => {
  const raw = fibonacciSphere(520);
  const tilt = 0.42; // radians around x, so the poles don't face the viewer
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const pts: { id: number; x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i] ?? 0;
    const y0 = raw[i + 1] ?? 0;
    const z0 = raw[i + 2] ?? 0;
    const y = y0 * cos - z0 * sin;
    const z = y0 * sin + z0 * cos;
    if (z < -0.15) continue; // the back of the shell is hidden by the core
    const depth = (z + 1) / 2;
    pts.push({
      id: i / 3,
      x: Math.round((50 + x * 44) * 100) / 100,
      y: Math.round((50 + y * 44) * 100) / 100,
      r: Math.round((0.35 + depth * 0.45) * 100) / 100,
      o: Math.round((0.25 + depth * 0.75) * 100) / 100,
    });
  }
  return pts;
})();

const TONE: Record<OrbState, string> = {
  idle: "text-ink/70",
  listening: "text-ask",
  speaking: "text-ask",
  "off-record": "text-ink-faint",
};

/**
 * Static orb: the same dotted shell as the WebGL orb, drawn once in SVG. Used before WebGL loads,
 * without WebGL, and when the viewer prefers reduced motion.
 */
export function OrbFallback({ state, className }: { state: OrbState; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={ORB_STATE_LABEL[state]}
      className={cx("size-full transition-colors duration-200", TONE[state], className)}
    >
      {POINTS.map((p) => (
        <circle key={p.id} cx={p.x} cy={p.y} r={p.r} fill="currentColor" fillOpacity={p.o} />
      ))}
    </svg>
  );
}
