"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useInView, usePageInView, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, Color, type Points, type PointsMaterial } from "three";
import { cx } from "@/components/ui/cx";
import { OrbFallback } from "./OrbFallback";
import {
  clampLevel,
  fibonacciSphere,
  ORB_PARAMS,
  ORB_STATE_LABEL,
  type OrbParams,
  type OrbState,
} from "./orbState";

export type VoiceOrbProps = {
  state: OrbState;
  /** Live audio level, 0..1. Without it, listening and speaking use a gentle synthetic level. */
  level?: number;
  className?: string;
};

type Palette = { ink: string; signal: string; faint: string; canvas: string };

const FALLBACK_PALETTE: Palette = {
  ink: "#ece5d6",
  signal: "#f0b44c",
  faint: "#7f8a93",
  canvas: "#0d1720",
};

const POINT_COUNT = 1800;

/**
 * The voice orb: a shell of points that breathes with Shadow's state.
 * Client-only. Callers load it with `dynamic(() => import(...), { ssr: false })`.
 *
 * - Renders on demand and only while on screen and the tab is visible.
 * - Pixel ratio is capped at 1.75.
 * - Without WebGL, or with reduced motion, it renders the static SVG orb instead.
 */
export function VoiceOrb({ state, level, className }: VoiceOrbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "120px" });
  const pageVisible = usePageInView();
  const reduceMotion = useReducedMotion();
  const webgl = useWebGLSupport();
  const palette = useThemePalette();

  const label = ORB_STATE_LABEL[state];
  const showCanvas = webgl === true && reduceMotion !== true;

  return (
    <div ref={ref} role="img" aria-label={label} className={cx("relative size-full", className)}>
      {showCanvas ? (
        <Canvas
          aria-hidden="true"
          dpr={[1, 1.75]}
          flat
          frameloop="demand"
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          camera={{ position: [0, 0, 3.1], fov: 40 }}
          fallback={<OrbFallback state={state} />}
        >
          <OrbScene state={state} level={level} palette={palette} running={inView && pageVisible} />
        </Canvas>
      ) : (
        <div aria-hidden="true" className="size-full">
          <OrbFallback state={state} />
        </div>
      )}
    </div>
  );
}

export default VoiceOrb;

function OrbScene({
  state,
  level,
  palette,
  running,
}: {
  state: OrbState;
  level: number | undefined;
  palette: Palette;
  running: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const points = useRef<Points>(null);
  const material = useRef<PointsMaterial>(null);

  const base = useMemo(() => fibonacciSphere(POINT_COUNT), []);
  const positions = useMemo(() => new Float32Array(base), [base]);
  const sprite = useMemo(() => makeDotTexture(), []);
  useEffect(() => () => sprite?.dispose(), [sprite]);

  // Live values ease toward the target so state changes read as a transition, not a cut.
  const current = useRef<OrbParams>({ ...ORB_PARAMS[state] });
  const time = useRef(0);
  const levelRef = useRef(clampLevel(level));
  levelRef.current = clampLevel(level);
  const colors = useMemo(
    () => ({
      ink: new Color(palette.ink),
      signal: new Color(palette.signal),
      faint: new Color(palette.faint),
      mixed: new Color(),
    }),
    [palette],
  );

  // Every render comes from a prop change (state, level, palette, visibility); each one asks
  // for a frame. The frame loop then keeps itself going only while there is motion to show.
  useEffect(() => {
    if (running) invalidate();
  });

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const target = ORB_PARAMS[state];
    const c = current.current;
    const k = 1 - Math.exp(-delta * 4); // ~250ms settle
    c.amplitude += (target.amplitude - c.amplitude) * k;
    c.levelGain += (target.levelGain - c.levelGain) * k;
    c.speed += (target.speed - c.speed) * k;
    c.opacity += (target.opacity - c.opacity) * k;
    time.current += delta * c.speed;
    const t = time.current;

    const synthetic =
      level === undefined && state !== "idle" && state !== "off-record"
        ? 0.35 + 0.3 * Math.sin(t * 5.3) * Math.sin(t * 2.1 + 1.3)
        : 0;
    const lvl = level === undefined ? synthetic : levelRef.current;
    const amp = c.amplitude + c.levelGain * lvl;

    for (let i = 0; i < POINT_COUNT; i++) {
      const j = i * 3;
      const x = base[j] ?? 0;
      const y = base[j + 1] ?? 0;
      const z = base[j + 2] ?? 0;
      const field =
        Math.sin(x * 3.1 + t * 1.3) * Math.cos(y * 2.7 - t * 0.9) +
        0.5 * Math.sin(z * 4.3 + y * 1.7 + t * 1.7);
      const r = 1 + amp * field;
      positions[j] = x * r;
      positions[j + 1] = y * r;
      positions[j + 2] = z * r;
    }

    const p = points.current;
    if (p) {
      const attr = p.geometry.getAttribute("position");
      attr.needsUpdate = true;
      p.rotation.y += delta * 0.12 * c.speed;
      p.rotation.x = 0.42;
    }

    // Off the record drains the colour to the faint ink; otherwise ink mixes toward the signal.
    if (state === "off-record") colors.mixed.copy(colors.faint);
    else colors.mixed.copy(colors.ink).lerp(colors.signal, target.signal);
    let colorDistance = 0;
    const m = material.current;
    if (m) {
      m.color.lerp(colors.mixed, k);
      m.opacity = c.opacity;
      colorDistance =
        Math.abs(m.color.r - colors.mixed.r) +
        Math.abs(m.color.g - colors.mixed.g) +
        Math.abs(m.color.b - colors.mixed.b);
    }

    // Keep rendering while visible and either moving or still settling into the new state.
    const settling =
      Math.abs(target.amplitude - c.amplitude) > 0.001 ||
      colorDistance > 0.006 ||
      Math.abs(target.opacity - c.opacity) > 0.004 ||
      Math.abs(target.speed - c.speed) > 0.004;
    if (running && (target.speed > 0 || settling)) invalidate();
  });

  return (
    <>
      {/* An opaque core in the page colour hides the far side of the shell, giving depth. */}
      <mesh>
        <sphereGeometry args={[0.84, 48, 48]} />
        <meshBasicMaterial color={palette.canvas} />
      </mesh>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={material}
          size={0.042}
          sizeAttenuation
          map={sprite}
          alphaTest={0.02}
          transparent
          depthWrite={false}
          color={palette.ink}
          opacity={ORB_PARAMS[state].opacity}
        />
      </points>
    </>
  );
}

/** A soft round sprite so points render as dots, not squares. */
function makeDotTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  return new CanvasTexture(canvas);
}

/** null until checked on the client, then whether a WebGL context can be created. */
function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const probe = document.createElement("canvas");
      const ctx = probe.getContext("webgl2") ?? probe.getContext("webgl");
      setSupported(ctx !== null);
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ink: pick("--sd-ink", FALLBACK_PALETTE.ink),
    signal: pick("--sd-brand", FALLBACK_PALETTE.signal),
    faint: pick("--sd-ink-faint", FALLBACK_PALETTE.faint),
    canvas: pick("--sd-canvas", FALLBACK_PALETTE.canvas),
  };
}

/** The orb takes its colours from the design tokens and follows scheme changes live. */
function useThemePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(FALLBACK_PALETTE);
  useEffect(() => {
    const update = () => setPalette(readPalette());
    update();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return palette;
}
