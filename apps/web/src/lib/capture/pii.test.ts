// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { piiRects } from "./pii";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    x: left,
    y: top,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function stub(el: Element, r: DOMRect) {
  el.getBoundingClientRect = () => r;
}

describe("piiRects", () => {
  it("returns rects relative to the root's bounding box", () => {
    document.body.innerHTML = `
      <div id="root">
        <span data-pii id="a">x</span>
        <div><span data-pii id="b">y</span></div>
        <span id="plain">z</span>
      </div>`;
    const root = document.getElementById("root") as HTMLElement;
    stub(root, rect(100, 50, 800, 600));
    stub(document.getElementById("a") as HTMLElement, rect(120, 60, 200, 20));
    stub(document.getElementById("b") as HTMLElement, rect(300, 400, 40, 10));
    stub(document.getElementById("plain") as HTMLElement, rect(0, 0, 10, 10));

    expect(piiRects(root)).toEqual([
      { x: 20, y: 10, w: 200, h: 20 },
      { x: 200, y: 350, w: 40, h: 10 },
    ]);
  });

  it("skips zero-sized elements and honours a custom selector", () => {
    document.body.innerHTML = `
      <div id="root">
        <span data-pii id="hidden">x</span>
        <span class="secret" id="s">y</span>
      </div>`;
    const root = document.getElementById("root") as HTMLElement;
    stub(root, rect(0, 0, 100, 100));
    stub(document.getElementById("hidden") as HTMLElement, rect(5, 5, 0, 0));
    stub(document.getElementById("s") as HTMLElement, rect(10, 20, 30, 40));

    expect(piiRects(root)).toEqual([]);
    expect(piiRects(root, ".secret")).toEqual([{ x: 10, y: 20, w: 30, h: 40 }]);
  });
});
