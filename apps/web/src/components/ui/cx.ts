/** Joins class names, skipping falsy values. Small on purpose: no merging of conflicting utilities. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
