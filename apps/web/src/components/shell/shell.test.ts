import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { type Command, filterCommands, groupCommands, matchScore } from "./commands";
import { interpretKey, isEditableTarget, isPaletteShortcut, modKeyLabel } from "./keys";
import { findNavItem, isBareRoute, isNakedRoute, resolveCrumbs } from "./nav";

const key = (
  k: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("nav", () => {
  it("keeps marketing routes outside the shell", () => {
    expect(isBareRoute("/")).toBe(true);
    expect(isBareRoute("/demo")).toBe(true);
    expect(isBareRoute("/demo/")).toBe(true);
    expect(isBareRoute("/capture")).toBe(false);
    expect(isBareRoute("/map/latest")).toBe(false);
  });

  it("renders capture with no chrome at all", () => {
    expect(isNakedRoute("/capture")).toBe(true);
    expect(isNakedRoute("/capture/")).toBe(true);
    expect(isNakedRoute("/teach")).toBe(true);
    expect(isNakedRoute("/map")).toBe(false);
    expect(isNakedRoute("/")).toBe(false);
  });

  it("matches nav items by prefix, not substring", () => {
    expect(findNavItem("/map/abc")?.id).toBe("maps");
    expect(findNavItem("/capture")?.id).toBe("capture");
    expect(findNavItem("/mapping")).toBeUndefined();
  });

  it("builds breadcrumbs with the record id", () => {
    expect(resolveCrumbs("/capture")).toEqual([{ label: "Capture" }]);
    expect(resolveCrumbs("/map/latest")).toEqual([
      { label: "Work Maps", href: "/map/latest" },
      { label: "Latest" },
    ]);
    expect(resolveCrumbs("/map/wm%2042")[1]).toEqual({ label: "wm 42" });
    expect(resolveCrumbs("/unknown")).toEqual([{ label: "Singoda AI" }]);
  });
});

describe("commands", () => {
  const cmd = (
    id: string,
    label: string,
    group: Command["group"],
    keywords?: string[],
  ): Command => ({
    id,
    label,
    group,
    keywords,
    run: vi.fn(),
  });
  const list = [
    cmd("a", "Start a capture session", "Actions", ["record"]),
    cmd("b", "Go to Work Maps", "Navigate"),
    cmd("c", "Show keyboard shortcuts", "Preferences", ["hotkeys"]),
  ];

  it("ranks prefix over word start over subsequence", () => {
    expect(matchScore("Capture", "cap")).toBeGreaterThan(matchScore("Start a capture", "cap"));
    expect(matchScore("Start a capture", "cap")).toBeGreaterThan(matchScore("Escape", "cap"));
    expect(matchScore("Work Maps", "wms")).toBeGreaterThan(0);
    expect(matchScore("Work Maps", "zzz")).toBe(0);
  });

  it("filters by label and keywords", () => {
    expect(filterCommands(list, "record").map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands(list, "hotk").map((c) => c.id)).toEqual(["c"]);
    expect(filterCommands(list, "")).toHaveLength(3);
    expect(filterCommands(list, "qqq")).toEqual([]);
  });

  it("groups in display order", () => {
    expect(groupCommands(list).map(([g]) => g)).toEqual(["Actions", "Navigate", "Preferences"]);
  });
});

describe("keys", () => {
  it("opens the palette with Cmd or Ctrl + K", () => {
    expect(isPaletteShortcut(key("k", { metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("K", { ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("k"))).toBe(false);
  });

  it("ignores single keys while typing", () => {
    expect(isEditableTarget({ tagName: "input" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("interprets ?, [ and G-then sequences", () => {
    expect(interpretKey(key("?", { shiftKey: true }), false)).toEqual({ type: "help" });
    expect(interpretKey(key("["), false)).toEqual({ type: "toggle-sidebar" });
    expect(interpretKey(key("g"), false)).toEqual({ type: "go-pending" });
    expect(interpretKey(key("c"), true)).toEqual({ type: "go", key: "c" });
    expect(interpretKey(key("c"), false)).toEqual({ type: "none" });
    expect(interpretKey(key("g", { metaKey: true }), false)).toEqual({ type: "none" });
  });

  it("labels the modifier per platform", () => {
    expect(modKeyLabel("MacIntel")).toBe("⌘");
    expect(modKeyLabel("Win32")).toBe("Ctrl");
  });
});

describe("light only", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

  it("has a single light palette that ignores the OS scheme", () => {
    expect(css).toMatch(/:root\s*{\s*color-scheme: light;/);
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/color-scheme: dark/);
    expect(css).not.toMatch(/:root\[data-theme/);
  });
});
