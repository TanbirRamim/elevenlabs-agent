"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "../ui";
import { cx } from "../ui/cx";
import { Wordmark } from "./BrandMark";

type NavItem = { href: string; label: string; match: string };

const NAV: readonly NavItem[] = [
  { href: "/capture", label: "Capture", match: "/capture" },
  { href: "/map/latest", label: "Work Map", match: "/map" },
  { href: "/teach", label: "Teach", match: "/teach" },
];

/**
 * The marketing header for pages outside the app shell (landing, demo replay).
 * In-app routes use the AppShell sidebar instead.
 */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-canvas">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="-ml-1 rounded-control px-1 py-1.5 text-ink"
          aria-label="Singoda AI, home"
        >
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <nav aria-label="Product" className="hidden sm:block">
            <ul className="flex items-center">
              {NAV.map((item) => {
                const current = pathname === item.match || pathname.startsWith(`${item.match}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={cx(
                        "inline-flex h-8 items-center rounded-control px-2 text-ui font-medium transition-colors duration-100 sm:px-2.5",
                        current ? "text-ink" : "text-ink-muted hover:bg-hover hover:text-ink",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <ButtonLink href="/capture" size="sm">
            Open app
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
