export type CommandGroup = "Navigate" | "Actions" | "Preferences";

export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  /** Extra words that should match (synonyms, ids). */
  keywords?: readonly string[];
  /** Shortcut hint shown on the right, e.g. ["G", "C"]. */
  shortcut?: readonly string[];
  /** Sequence ("G then C") rather than a chord. */
  sequence?: boolean;
  hint?: string;
  run: () => void;
};

/**
 * Scores how well `query` matches `text`: prefix > word start > substring > subsequence.
 * Returns 0 for no match. Case-insensitive.
 */
export function matchScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100 - Math.min(50, t.length - q.length);
  const wordIdx = t.split(/[\s/-]+/).findIndex((w) => w.startsWith(q));
  if (wordIdx >= 0) return 70 - wordIdx;
  if (t.includes(q)) return 50;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return 20;
  }
  return 0;
}

/** Filters and orders commands for the palette. Stable within equal scores (group order kept). */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  if (!query.trim()) return [...commands];
  return commands
    .map((c, idx) => ({
      c,
      idx,
      score: Math.max(
        matchScore(c.label, query),
        ...(c.keywords ?? []).map((k) => matchScore(k, query) - 5),
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((r) => r.c);
}

/** Groups in display order, skipping empty ones. */
export function groupCommands(commands: readonly Command[]): Array<[CommandGroup, Command[]]> {
  const order: CommandGroup[] = ["Actions", "Navigate", "Preferences"];
  return order
    .map((g) => [g, commands.filter((c) => c.group === g)] as [CommandGroup, Command[]])
    .filter(([, list]) => list.length > 0);
}
