"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";
import { Wordmark } from "./BrandMark";

type NavItem = { href: string; label: string; match: string };

const NAV: readonly NavItem[] = [
  { href: "/capture", label: "Capture", match: "/capture" },
  { href: "/map/latest", label: "Work Map", match: "/map" },
  { href: "/teach", label: "Teach", match: "/teach" },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="-ml-1 rounded-control px-1 py-2 text-ink"
          aria-label="Shadow, home"
        >
          <Wordmark />
        </Link>
        <nav aria-label="Modules">
          <ol className="flex items-center">
            {NAV.map((item) => {
              const current = pathname === item.match || pathname.startsWith(`${item.match}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cx(
                      "relative inline-flex min-h-11 items-center px-2.5 text-[0.9375rem] transition-colors duration-150 sm:px-3",
                      "after:absolute after:inset-x-2.5 after:bottom-1.5 after:h-px after:bg-current after:transition-opacity sm:after:inset-x-3",
                      current
                        ? "text-ink after:opacity-100"
                        : "text-ink-muted after:opacity-0 hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </header>
  );
}
