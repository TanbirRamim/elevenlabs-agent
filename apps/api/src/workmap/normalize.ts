/** Whitespace- and case-insensitive comparison form for verbatim-quote checks (§6.6). */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
