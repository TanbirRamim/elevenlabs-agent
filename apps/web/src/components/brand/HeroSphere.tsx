"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useInView, usePageInView, useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Color, type Group, type ShaderMaterial } from "three";
import { MarkImage } from "./MarkImage";
import { sphereDots } from "./sphereDots";

/** The mark's gradient: purple at the top to deep navy at the bottom. Light theme only. */
const GRADIENT = { top: "#7c4dff", bottom: "#1e1b4b" } as const;

/** Dot diameter at the centre of the face, as a fraction of the sphere radius. */
const DOT_SIZE = 0.13;

/**
 * The entrance: dots fade and grow in row by row from the top. Each dot takes REVEAL_DOT
 * seconds (easeOutCubic) and starts up to REVEAL_STAGGER seconds after the first row, so the
 * whole reveal lasts REVEAL_TOTAL (about 1.05 s). The PNG placeholder is wiped away in step.
 */
export const REVEAL_DOT = 0.6;
export const REVEAL_STAGGER = 0.45;
export const REVEAL_TOTAL = REVEAL_DOT + REVEAL_STAGGER;

/** Longest step the motion takes in one frame, so a resumed tab or a hitch never jumps. */
export const MAX_DELTA = 1 / 30;

/** Angular frequency of the pointer-parallax spring (rad/s); critically damped. */
const PARALLAX_OMEGA = 7;

/** Smooth start, gentle settle. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** Hermite smoothstep of t between edges a and b, clamped to 0..1. */
export function smoothstep(a: number, b: number, t: number): number {
  const c = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return c * c * (3 - 2 * c);
}

/** Per-dot reveal delay, 0 for the top row to 1 for the bottom row, from flat xyz positions. */
export function revealDelays(positions: Float32Array): Float32Array {
  const n = positions.length / 3;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1] ?? 0;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (maxY - (positions[i * 3 + 1] ?? 0)) / span;
  return out;
}

/** Where the reveal front sits, as a % of the box height from the top, at a point in the reveal. */
export function revealFrontPercent(revealSeconds: number): number {
  // A row is half shown (easeOutCubic = 0.5) about 0.21 of REVEAL_DOT after it starts. The
  // rows span about 15%..87% of the box at this camera distance.
  const halfShown = 0.206 * REVEAL_DOT;
  return 15 + ((revealSeconds - halfShown) / REVEAL_STAGGER) * 72;
}

/**
 * The PNG placeholder's crossfade at a point in the reveal: a soft mask wipes it away row by
 * row just behind the dots' reveal front, and a last opacity fade clears what remains.
 */
export function placeholderFade(revealSeconds: number): { mask: string; opacity: number } {
  const front = revealFrontPercent(revealSeconds);
  const soft = 9;
  const mask = `linear-gradient(to bottom, transparent ${(front - soft).toFixed(2)}%, #000 ${(front + soft).toFixed(2)}%)`;
  const opacity = 1 - smoothstep(0.6 * REVEAL_TOTAL, REVEAL_TOTAL, revealSeconds);
  return { mask, opacity };
}

export type Spring = { x: number; v: number };

/**
 * One step of a critically damped spring toward `target`. Frame-rate independent: `dt` is
 * clamped and split into small sub-steps so the integration stays stable at any frame rate.
 */
export function springStep(s: Spring, target: number, dt: number, omega = PARALLAX_OMEGA): void {
  const total = Math.min(Math.max(dt, 0), MAX_DELTA);
  const steps = Math.max(1, Math.ceil(total * 120));
  const h = total / steps;
  for (let i = 0; i < steps; i++) {
    const a = omega * omega * (target - s.x) - 2 * omega * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uReveal;
uniform float uRevealDot;
uniform float uRevealStagger;
uniform float uViewportH;
uniform float uDotSize;
uniform vec3 uTop;
uniform vec3 uBottom;
attribute float aDelay;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 p = position;
  // A slow travelling ripple across the surface plus a gentle breath of the whole sphere.
  float ripple = sin(p.y * 6.0 - uTime * 1.1) * cos(p.x * 4.0 + uTime * 0.7);
  float breath = sin(uTime * 0.9);
  p *= 1.0 + uMotion * (0.012 * ripple + 0.01 * breath);

  // Entrance: each row eases in (easeOutCubic) a little after the row above it.
  float local = clamp((uReveal - aDelay * uRevealStagger) / uRevealDot, 0.0, 1.0);
  float shown = 1.0 - pow(1.0 - local, 3.0);

  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;

  // How squarely the dot faces the camera: big at the centre, small toward the rim, gone behind.
  vec3 n = normalize(mat3(modelMatrix) * position);
  float facing = dot(n, normalize(cameraPosition - world.xyz));
  float size = mix(0.28, 1.0, pow(max(facing, 0.0), 0.75)) * mix(0.35, 1.0, shown);
  gl_PointSize = uDotSize * size * projectionMatrix[1][1] * uViewportH * 0.5 / -mv.z;

  vColor = mix(uBottom, uTop, smoothstep(-0.95, 0.95, world.y));
  vAlpha = smoothstep(0.0, 0.14, facing) * shown;
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  // Crisp round dot with a one-pixel-ish soft edge.
  float edge = fwidth(d);
  float a = 1.0 - smoothstep(0.5 - edge * 1.5, 0.5, d);
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
  #include <colorspace_fragment>
}
`;

/**
 * The hero's animated mark: the Singoda AI dot sphere in WebGL. Client-only; load it through
 * `HeroMark`, which imports it with `ssr: false` and shows the PNG until it is ready.
 *
 * - The PNG stays mounted under the canvas in the same box, so nothing shifts; the dots
 *   reveal row by row while the PNG fades out (driven from the frame loop, no React state).
 * - Renders only while on screen and the tab is visible; pixel ratio capped at 1.5.
 * - With reduced motion it renders one still, fully revealed frame.
 * - Without WebGL it keeps the PNG mark.
 */
export function HeroSphere() {
  const ref = useRef<HTMLDivElement>(null);
  const placeholder = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "80px" });
  const pageVisible = usePageInView();
  const reduceMotion = useReducedMotion() === true;
  const webgl = useWebGLSupport();

  const running = inView && pageVisible && !reduceMotion;

  return (
    <div ref={ref} className="relative size-full">
      <div ref={placeholder} className="absolute inset-0">
        <MarkImage />
      </div>
      {webgl === true && (
        <div className="absolute inset-0">
          <Canvas
            aria-hidden="true"
            dpr={[1, 1.5]}
            flat
            frameloop={running ? "always" : "demand"}
            gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
            camera={{ position: [0, 0, 4.9], fov: 32 }}
          >
            <SphereScene animate={!reduceMotion} running={running} placeholder={placeholder} />
          </Canvas>
        </div>
      )}
    </div>
  );
}

export default HeroSphere;

function SphereScene({
  animate,
  running,
  placeholder,
}: {
  animate: boolean;
  running: boolean;
  placeholder: RefObject<HTMLDivElement | null>;
}) {
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const invalidate = useThree((s) => s.invalidate);
  const positions = useMemo(() => sphereDots(), []);
  const delays = useMemo(() => revealDelays(positions), [positions]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMotion: { value: 0 },
      uReveal: { value: 0 },
      uRevealDot: { value: REVEAL_DOT },
      uRevealStagger: { value: REVEAL_STAGGER },
      uViewportH: { value: 1 },
      uDotSize: { value: DOT_SIZE },
      uTop: { value: new Color(GRADIENT.top) },
      uBottom: { value: new Color(GRADIENT.bottom) },
    }),
    [],
  );

  // A still canvas (reduced motion) still needs its one frame once the scene is mounted.
  useEffect(() => {
    if (!animate) invalidate();
  }, [animate, invalidate]);

  // Pointer position over the window, -1..1 from the centre; read only while animating.
  // Leaving the window eases the tilt back to rest instead of freezing it mid-lean.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!running) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onLeave = () => {
      pointer.current.x = 0;
      pointer.current.y = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [running]);

  const tiltX = useRef<Spring>({ x: 0, v: 0 });
  const tiltY = useRef<Spring>({ x: 0, v: 0 });
  const placeholderDone = useRef(false);

  useFrame((state, rawDelta) => {
    const g = group.current;
    const m = material.current;
    if (!g || !m) return;
    // Clamp: after a tab switch or an off-screen pause the clock reports the whole gap.
    const delta = Math.min(Math.max(rawDelta, 0), MAX_DELTA);
    // r3f may hand the material its own copy of the uniforms, so write through the material.
    const u = m.uniforms as typeof uniforms;
    u.uViewportH.value = state.gl.domElement.height;

    if (!animate) {
      u.uMotion.value = 0;
      u.uReveal.value = REVEAL_TOTAL;
      g.rotation.set(0.08, 0, 0);
    } else {
      u.uReveal.value = Math.min(REVEAL_TOTAL, u.uReveal.value + delta);
      u.uTime.value += delta;
      // Ease the ripple in after the reveal so the sphere settles rather than starts mid-wobble.
      u.uMotion.value = smoothstep(0.4, 2, u.uTime.value);
      const t = u.uTime.value;
      springStep(tiltX.current, pointer.current.y * 0.12, delta);
      springStep(tiltY.current, pointer.current.x * 0.18, delta);
      // A slow sway keeps the face (and its smile) toward the viewer; both start at rest.
      g.rotation.y = Math.sin(t * 0.22) * 0.32 + tiltY.current.x;
      g.rotation.x = 0.08 + (Math.sin(t * 0.17 + 1.1) - Math.sin(1.1)) * 0.05 + tiltX.current.x;
    }

    // Crossfade the PNG out as the dots come in; write the DOM directly, never React state.
    if (!placeholderDone.current) {
      const el = placeholder.current;
      const fade = placeholderFade(animate ? u.uReveal.value : REVEAL_TOTAL);
      const opacity = fade.opacity;
      if (el) {
        el.style.opacity = String(opacity);
        el.style.maskImage = fade.mask;
        el.style.setProperty("-webkit-mask-image", fade.mask);
        if (opacity === 0) el.style.visibility = "hidden";
      }
      if (opacity === 0) placeholderDone.current = true;
    }
  });

  return (
    <group ref={group}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aDelay" args={[delays, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/** null until checked on the client, then whether a WebGL context can be created. */
function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const probe = document.createElement("canvas");
      const ctx = probe.getContext("webgl2") ?? probe.getContext("webgl");
      setSupported(ctx !== null);
      ctx?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}
