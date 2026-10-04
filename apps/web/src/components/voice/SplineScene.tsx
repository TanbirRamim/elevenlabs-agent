"use client";

import dynamic from "next/dynamic";
import { z } from "zod";
import { cx } from "@/components/ui/cx";

const Spline = dynamic(() => import("@splinetool/react-spline"), { ssr: false });

// Optional. Inlined at build time. See docs/DESIGN.md, "Optional Spline scene".
const SceneUrl = z.url({ protocol: /^https$/ });
const parsed = SceneUrl.safeParse(process.env.NEXT_PUBLIC_SPLINE_SCENE_URL);
const SCENE_URL = parsed.success ? parsed.data : null;

/**
 * Renders a Spline scene only when NEXT_PUBLIC_SPLINE_SCENE_URL is set to an https URL.
 * Otherwise renders nothing, so callers can place it unconditionally.
 */
export function SplineScene({ className, label }: { className?: string; label: string }) {
  if (!SCENE_URL) return null;
  return (
    <div role="img" aria-label={label} className={cx("relative size-full", className)}>
      <Spline scene={SCENE_URL} renderOnDemand />
    </div>
  );
}
