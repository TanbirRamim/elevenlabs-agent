"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";

export type RevealProps = {
  children: ReactNode;
  /** Seconds to wait after entering the viewport. Use it to sequence siblings, 0.04–0.06 apart. */
  delay?: number;
  /** Distance in px the content rises. Keep it small; this is a reveal, not an entrance. */
  rise?: number;
  className?: string;
  as?: "div" | "li" | "section";
};

/**
 * Reveals content once, when it first scrolls into view. Use it for one orchestrated moment per
 * page, never on every section. With reduced motion it renders the content immediately.
 *
 * Content the reader jumped past (anchor link, restored scroll) is shown too, so nothing above
 * the viewport is ever left invisible.
 */
export function Reveal({ children, delay = 0, rise = 6, className, as = "div" }: RevealProps) {
  const reduce = useReducedMotion();
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!node || reduce) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, reduce]);

  if (reduce) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  const Component = as === "li" ? motion.li : as === "section" ? motion.section : motion.div;
  return (
    <Component
      ref={setNode}
      className={className}
      initial={{ opacity: 0, y: rise }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: rise }}
      transition={{ duration: 0.2, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </Component>
  );
}
