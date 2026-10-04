"use client";

import { ChevronRight, Menu, PanelLeft, Search } from "lucide-react";
import Link from "next/link";
import { Fragment, type Ref } from "react";
import { IconButton, Tooltip } from "../ui";
import type { Crumb } from "./nav";

export type TopBarProps = {
  crumbs: Crumb[];
  modKey: string;
  onOpenMenu: () => void;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  statusRef: Ref<HTMLDivElement>;
  actionsRef: Ref<HTMLDivElement>;
};

/** 48px bar: sidebar toggle, breadcrumb, then the live status and page action slots. */
export function TopBar({
  crumbs,
  modKey,
  onOpenMenu,
  onToggleSidebar,
  onOpenPalette,
  statusRef,
  actionsRef,
}: TopBarProps) {
  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-rule bg-surface px-3 sm:px-4">
      <IconButton label="Open navigation" size="sm" onClick={onOpenMenu} className="lg:hidden">
        <Menu />
      </IconButton>
      <span className="hidden lg:inline-flex">
        <Tooltip content="Toggle sidebar" shortcut={["["]} side="bottom">
          <IconButton label="Toggle sidebar" size="sm" onClick={onToggleSidebar}>
            <PanelLeft />
          </IconButton>
        </Tooltip>
      </span>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1 text-ui">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={c.href ?? c.label}>
                {i > 0 ? (
                  <li aria-hidden="true" className="text-ink-faint">
                    <ChevronRight className="size-3.5 stroke-[1.75]" />
                  </li>
                ) : null}
                <li className="min-w-0 truncate">
                  {c.href && !last ? (
                    <Link
                      href={c.href}
                      className="rounded-[4px] px-1 py-0.5 text-ink-muted transition-colors hover:text-ink"
                    >
                      {c.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={last ? "page" : undefined}
                      className="px-1 font-medium text-ink"
                    >
                      {c.label}
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
      <div ref={statusRef} className="flex items-center gap-2 empty:hidden" />
      <div ref={actionsRef} className="flex items-center gap-1.5 empty:hidden" />
      <span className="lg:hidden">
        <IconButton label={`Search (${modKey} K)`} size="sm" onClick={onOpenPalette}>
          <Search />
        </IconButton>
      </span>
    </div>
  );
}
