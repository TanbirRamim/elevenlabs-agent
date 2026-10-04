/**
 * Parse a single HTTP Range header ("bytes=a-b", "bytes=a-", "bytes=-n") against
 * an object of `size` bytes. Returns inclusive offsets, or null when malformed
 * or unsatisfiable (RFC 9110 §14).
 */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || size === 0) return null;
  const [, first, last] = m;
  if (first === "" && last === "") return null;
  if (first === "") {
    const suffix = Number(last);
    if (suffix === 0) return null;
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return null;
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (end < start) return null;
  return { start, end };
}
