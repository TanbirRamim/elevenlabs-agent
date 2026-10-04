"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useInView, usePageInView, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, type Group, type ShaderMaterial } from "three";
import { MarkImage } from "./MarkImage";
import { sphereDots } from "./sphereDots";

/** The mark's gradient: purple at the top to deep navy at the bottom; lifted on dark canvas. */
const GRADIENT = {
  light: { top: "#7c4dff", bottom: "#1e1b4b" },
  dark: { top: "#9a7bff", bottom: "#3b3794" },
} as const;

/** Dot diameter at the centre of the face, as a fraction of the sphere radius. */
const DOT_SIZE = 0.13;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uViewportH;
uniform float uDotSize;
uniform vec3 uTop;
uniform vec3 uBottom;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 p = position;
  // A slow travelling ripple across the surface plus a gentle breath of the whole sphere.
  float ripple = sin(p.y * 6.0 - uTime * 1.1) * cos(p.x * 4.0 + uTime * 0.7);
  float breath = sin(uTime * 0.9);
  p *= 1.0 + uMotion * (0.012 * ripple + 0.01 * breath);

  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;

  // How squarely the dot faces the camera: big at the centre, small toward the rim, gone behind.
  vec3 n = normalize(mat3(modelMatrix) * position);
  float facing = dot(n, normalize(cameraPosition - world.xyz));
  float size = mix(0.28, 1.0, pow(max(facing, 0.0), 0.75));
  gl_PointSize = uDotSize * size * projectionMatrix[1][1] * uViewportH * 0.5 / -mv.z;

  vColor = mix(uBottom, uTop, smoothstep(-0.95, 0.95, world.y));
  vAlpha = smoothstep(0.0, 0.14, facing);
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
 * - Renders only while on screen and the tab is visible; pixel ratio capped at 1.5.
 * - With reduced motion it renders one still frame.
 * - Without WebGL it shows the PNG mark.
 */
export function HeroSphere() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "80px" });
  const pageVisible = usePageInView();
  const reduceMotion = useReducedMotion() === true;
  const webgl = useWebGLSupport();
  const dark = useDarkScheme();

  if (webgl === false) return <MarkImage />;

  const running = inView && pageVisible && !reduceMotion;

  return (
    <div ref={ref} className="size-full">
      {webgl === null ? (
        <MarkImage />
      ) : (
        <Canvas
          aria-hidden="true"
          dpr={[1, 1.5]}
          flat
          frameloop={running ? "always" : "demand"}
          gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
          camera={{ position: [0, 0, 4.9], fov: 32 }}
          fallback={<MarkImage />}
        >
          <SphereScene dark={dark} animate={!reduceMotion} running={running} />
        </Canvas>
      )}
    </div>
  );
}

export default HeroSphere;

function SphereScene({
  dark,
  animate,
  running,
}: {
  dark: boolean;
  animate: boolean;
  running: boolean;
}) {
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const invalidate = useThree((s) => s.invalidate);
  const positions = useMemo(() => sphereDots(), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMotion: { value: 0 },
      uViewportH: { value: 1 },
      uDotSize: { value: DOT_SIZE },
      uTop: { value: new Color(GRADIENT.light.top) },
      uBottom: { value: new Color(GRADIENT.light.bottom) },
    }),
    [],
  );

  // Colours follow the scheme; a still canvas needs a new frame to show them.
  useEffect(() => {
    const g = dark ? GRADIENT.dark : GRADIENT.light;
    uniforms.uTop.value.set(g.top);
    uniforms.uBottom.value.set(g.bottom);
    invalidate();
  }, [dark, uniforms, invalidate]);

  // Pointer position over the window, -1..1 from the centre; read only while animating.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!running) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [running]);

  const tilt = useRef({ x: 0, y: 0 });
  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const g = group.current;
    const m = material.current;
    if (!g || !m) return;
    // r3f may hand the material its own copy of the uniforms, so write through the material.
    const u = m.uniforms as typeof uniforms;
    u.uViewportH.value = state.gl.domElement.height;
    u.uTop.value.copy(uniforms.uTop.value);
    u.uBottom.value.copy(uniforms.uBottom.value);
    if (!animate) {
      u.uMotion.value = 0;
      g.rotation.set(0.08, 0, 0);
      return;
    }
    u.uTime.value += delta;
    // Ease the motion in on first paint so the sphere settles rather than starts mid-wobble.
    u.uMotion.value = Math.min(1, u.uMotion.value + delta * 0.8);
    const t = u.uTime.value;
    const k = 1 - Math.exp(-delta * 2.5);
    tilt.current.x += (pointer.current.y * 0.12 - tilt.current.x) * k;
    tilt.current.y += (pointer.current.x * 0.18 - tilt.current.y) * k;
    // A slow sway keeps the face (and its smile) toward the viewer.
    g.rotation.y = Math.sin(t * 0.22) * 0.32 + tilt.current.y;
    g.rotation.x = 0.08 + Math.sin(t * 0.17 + 1.1) * 0.05 + tilt.current.x;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
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

/** Whether the page is in the dark scheme: `data-theme` forces one, otherwise the OS decides. */
function useDarkScheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const forced = document.documentElement.dataset.theme;
      setDark(forced === "dark" || (forced !== "light" && media.matches));
    };
    update();
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
  return dark;
}
