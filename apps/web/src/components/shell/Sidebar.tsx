"use client";

import { Keyboard, Search, X } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "../brand/BrandMark";
import { Avatar, IconButton, Kbd } from "../ui";
import { cx } from "../ui/cx";
import { isCurrent, type NavItem, PRODUCT_NAV, TOOLS_NAV } from "./nav";

export type SidebarProps = {
  pathname: string;
  modKey: string;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  /** Called after a nav link is followed (closes the mobile sheet). */
  onNavigate?: () => void;
  /** Renders a close button in the header (mobile sheet). */
  onClose?: () => void;
};

/** Sidebar content, shared by the desktop rail and the mobile sheet. */
export function Sidebar({
  pathname,
  modKey,
  onOpenPalette,
  onOpenShortcuts,
  onNavigate,
  onClose,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-4 px-3 pt-3 pb-3">
      <div className="flex h-8 items-center justify-between px-1.5">
        <Link
          href="/"
          onClick={onNavigate}
          className="-mx-1 rounded-control px-1 py-1 text-ink"
          aria-label="Singoda AI, home"
        >
          <Wordmark />
        </Link>
        {onClose ? (
          <IconButton label="Close navigation" size="sm" onClick={onClose} className="-mr-1">
            <X />
          </IconButton>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-8 w-full items-center gap-2 rounded-control border border-rule bg-surface px-2 text-left text-ui text-ink-faint shadow-raised transition-colors duration-100 hover:border-rule-strong hover:text-ink-muted"
      >
        <Search aria-hidden="true" className="size-3.5 stroke-[1.75]" />
        <span className="flex-1">Search or jump to</span>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <nav aria-label="Product" className="flex flex-col gap-4">
        <NavGroup items={PRODUCT_NAV} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="More" items={TOOLS_NAV} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="mt-auto flex items-center gap-2 border-t border-rule px-1 pt-3">
        <Avatar name="Singoda AI" size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-ui font-medium text-ink">Singoda AI</p>
          <p className="truncate text-2xs text-ink-faint">Support escalations</p>
        </div>
        <IconButton label="Keyboard shortcuts" size="sm" onClick={onOpenShortcuts}>
          <Keyboard />
        </IconButton>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label?: string;
  items: readonly NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {label ? <p className="px-2 pb-1 text-2xs font-medium text-ink-faint">{label}</p> : null}
      <ul className="flex flex-col gap-px">
        {items.map((item) => {
          const current = isCurrent(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "group flex h-8 items-center gap-2.5 rounded-control px-2 text-ui font-medium transition-colors duration-100 pointer-coarse:h-10",
                  current ? "bg-selected text-ink" : "text-ink-muted hover:bg-hover hover:text-ink",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cx(
                    "size-4 shrink-0 stroke-[1.75]",
                    current ? "text-ink" : "text-ink-faint group-hover:text-ink-muted",
                  )}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.goKey ? (
                  <span
                    aria-hidden="true"
                    className="hidden font-mono text-2xs text-ink-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100 lg:inline"
                  >
                    G {item.goKey.toUpperCase()}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
