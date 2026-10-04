"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "../ui";
import { cx } from "../ui/cx";
import { CommandPalette } from "./CommandPalette";
import type { Command } from "./commands";
import { interpretKey, isEditableTarget, isPaletteShortcut, modKeyLabel } from "./keys";
import { ALL_NAV, PRODUCT_NAV, resolveCrumbs } from "./nav";
import { ShellContext } from "./ShellContext";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const SIDEBAR_KEY = "shadow-sidebar";
/** Query flag the Capture page reads to open its preflight right away (seam for /capture). */
export const START_CAPTURE_HREF = "/capture?intent=start";

/**
 * The in-app frame: a 240px sidebar on the canvas, the page on an inset surface panel with a
 * 48px top bar. Owns the command palette (⌘K), the shortcuts dialog (?), go-to keys (G then
 * C/M/T/P), the sidebar toggle ([) and the mobile navigation sheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modKey, setModKey] = useState("⌘");
  const [actionsNode, setActionsNode] = useState<HTMLDivElement | null>(null);
  const [statusNode, setStatusNode] = useState<HTMLDivElement | null>(null);
  const goPending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setModKey(modKeyLabel(navigator.platform || navigator.userAgent));
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "collapsed");
    } catch {
      // Storage blocked: keep the sidebar open.
    }
  }, []);

  // Close the mobile sheet whenever the route changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger, not a value read
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "open");
      } catch {
        // Storage blocked: the toggle still works for this view.
      }
      return next;
    });
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "capture.start",
        label: "Start a capture session",
        group: "Actions",
        keywords: ["record", "new", "session"],
        run: () => router.push(START_CAPTURE_HREF),
      },
      {
        id: "map.latest",
        label: "Open the latest Work Map",
        group: "Actions",
        keywords: ["map", "published", "workflow"],
        run: () => router.push("/map/latest"),
      },
      {
        id: "map.sample",
        label: "Open the sample Work Map",
        group: "Actions",
        keywords: ["fixture", "example"],
        run: () => router.push("/map/latest?fixture=1"),
      },
      ...ALL_NAV.map<Command>((n) => ({
        id: `go.${n.id}`,
        label: `Go to ${n.label}`,
        group: "Navigate",
        keywords: [n.label, n.description],
        hint: n.description,
        shortcut: n.goKey ? ["G", n.goKey.toUpperCase()] : undefined,
        sequence: Boolean(n.goKey),
        run: () => router.push(n.href),
      })),
      {
        id: "go.home",
        label: "Go to the Singoda AI homepage",
        group: "Navigate",
        keywords: ["landing", "home"],
        run: () => router.push("/"),
      },
      {
        id: "help.shortcuts",
        label: "Show keyboard shortcuts",
        group: "Preferences",
        keywords: ["keys", "help", "hotkeys"],
        shortcut: ["?"],
        run: () => setShortcutsOpen(true),
      },
      {
        id: "sidebar.toggle",
        label: "Toggle the sidebar",
        group: "Preferences",
        shortcut: ["["],
        run: toggleSidebar,
      },
    ],
    [router, toggleSidebar],
  );

  useEffect(() => {
    const clearGo = () => {
      if (goPending.current) clearTimeout(goPending.current);
      goPending.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (isEditableTarget(e.target as HTMLElement | null)) return;
      if (document.querySelector("dialog[open]")) return;
      const action = interpretKey(e, goPending.current !== null);
      switch (action.type) {
        case "help":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        case "toggle-sidebar":
          e.preventDefault();
          toggleSidebar();
          break;
        case "go-pending":
          clearGo();
          goPending.current = setTimeout(clearGo, 1200);
          break;
        case "go": {
          clearGo();
          const target = PRODUCT_NAV.find((n) => n.goKey === action.key);
          if (target) {
            e.preventDefault();
            router.push(target.href);
          }
          break;
        }
        default:
          clearGo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearGo();
    };
  }, [router, toggleSidebar]);

  const api = useMemo(
    () => ({
      openPalette: () => setPaletteOpen(true),
      openShortcuts: () => setShortcutsOpen(true),
      toggleSidebar,
      actionsNode,
      statusNode,
    }),
    [toggleSidebar, actionsNode, statusNode],
  );

  const sidebarProps = {
    pathname,
    modKey,
    onOpenPalette: () => setPaletteOpen(true),
    onOpenShortcuts: () => setShortcutsOpen(true),
  };

  return (
    <ShellContext.Provider value={api}>
      <div className="flex min-h-dvh bg-canvas lg:h-dvh lg:overflow-hidden">
        <aside
          aria-label="Sidebar"
          className={cx(
            "sticky top-0 hidden h-dvh w-60 shrink-0 lg:block",
            collapsed && "lg:hidden",
          )}
        >
          <Sidebar {...sidebarProps} />
        </aside>

        <div className={cx("flex min-w-0 flex-1 flex-col lg:p-2", !collapsed && "lg:pl-0")}>
          <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-surface lg:h-[calc(100dvh-1rem)] lg:min-h-0 lg:flex-none lg:overflow-y-auto lg:rounded-panel lg:border lg:border-rule lg:shadow-raised">
            <TopBar
              crumbs={resolveCrumbs(pathname)}
              modKey={modKey}
              onOpenMenu={() => setMenuOpen(true)}
              onToggleSidebar={toggleSidebar}
              onOpenPalette={() => setPaletteOpen(true)}
              statusRef={setStatusNode}
              actionsRef={setActionsNode}
            />
            <div id="content" className="min-w-0 flex-1">
              {children}
            </div>
          </div>
        </div>
      </div>

      <Sheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title="Navigation"
        hideTitle
        side="left"
        width="w-72"
      >
        <Sidebar
          {...sidebarProps}
          onNavigate={() => setMenuOpen(false)}
          onClose={() => setMenuOpen(false)}
        />
      </Sheet>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} modKey={modKey} />
    </ShellContext.Provider>
  );
}
