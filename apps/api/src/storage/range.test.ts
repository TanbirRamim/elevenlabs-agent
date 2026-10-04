import { describe, expect, it } from "vitest";
import { parseRange } from "./range.js";

describe("parseRange", () => {
  it.each([
    ["bytes=0-99", 1000, { start: 0, end: 99 }],
    ["bytes=500-", 1000, { start: 500, end: 999 }],
    ["bytes=-200", 1000, { start: 800, end: 999 }],
    ["bytes=0-5000", 1000, { start: 0, end: 999 }], // end clamped to size
    ["bytes=-5000", 1000, { start: 0, end: 999 }], // suffix larger than object
    ["bytes=0-0", 1000, { start: 0, end: 0 }],
  ])("%s on %d bytes -> %o", (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });

  it.each([
    ["bytes=1000-", 1000], // start beyond EOF
    ["bytes=9-5", 1000], // end before start
    ["bytes=-0", 1000], // empty suffix
    ["bytes=-", 1000],
    ["bites=0-5", 1000], // wrong unit
    ["0-5", 1000],
    ["bytes=0-5", 0], // empty object
  ])("%s on %d bytes -> null", (header, size) => {
    expect(parseRange(header, size)).toBeNull();
  });
});
