import type { Rect } from "./types";

/**
 * Rects of every `[data-pii]` element inside `root`, relative to root's bounding box
 * (CSS pixels). Thin wrapper over getBoundingClientRect; the caller scales to video space.
 */
export function piiRects(root: Element, selector = "[data-pii]"): Rect[] {
  const base = root.getBoundingClientRect();
  const out: Rect[] = [];
  for (const el of root.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    out.push({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
  }
  return out;
}
