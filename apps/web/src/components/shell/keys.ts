/** Keyboard helpers for global shortcuts. Pure, so they are unit-tested without a DOM. */

export type KeyLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

type TargetLike = { tagName?: string; isContentEditable?: boolean } | null;

/** True when typing should not trigger single-key shortcuts (inputs, textareas, editors). */
export function isEditableTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** ⌘K on macOS, Ctrl+K elsewhere. Works even while typing. */
export function isPaletteShortcut(e: KeyLike): boolean {
  return e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey;
}

export type ShellKeyAction =
  | { type: "help" }
  | { type: "toggle-sidebar" }
  | { type: "go-pending" }
  | { type: "go"; key: string }
  | { type: "none" };

/**
 * Interprets one keydown for the single-key shortcuts (`?`, `[`, `G then <key>`).
 * `goPending` is whether the previous key was a bare `g` within the sequence window.
 */
export function interpretKey(e: KeyLike, goPending: boolean): ShellKeyAction {
  if (e.metaKey || e.ctrlKey || e.altKey) return { type: "none" };
  const k = e.key.toLowerCase();
  if (goPending && /^[a-z]$/.test(k)) return { type: "go", key: k };
  if (e.key === "?") return { type: "help" };
  if (e.key === "[") return { type: "toggle-sidebar" };
  if (k === "g" && !e.shiftKey) return { type: "go-pending" };
  return { type: "none" };
}

/** Platform label for the modifier, decided on the client. */
export function modKeyLabel(platform: string): "⌘" | "Ctrl" {
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
}
