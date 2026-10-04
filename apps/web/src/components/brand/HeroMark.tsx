"use client";

import dynamic from "next/dynamic";
import { cx } from "../ui/cx";
import { MarkImage } from "./MarkImage";

// three.js stays out of the server render and the initial bundle; the PNG holds the space.
const HeroSphere = dynamic(() => import("./HeroSphere"), {
  ssr: false,
  loading: () => <MarkImage />,
});

/** The landing hero's mark: the Singoda AI dot sphere, animated in WebGL when it can be. */
export function HeroMark({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx("relative aspect-square", className)}>
      <HeroSphere />
    </div>
  );
}
