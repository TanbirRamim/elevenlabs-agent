"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "../brand/SiteHeader";
import { ToastProvider } from "../ui";
import { AppShell } from "./AppShell";
import { isBareRoute } from "./nav";

/**
 * Picks the frame for a route: marketing pages (/, /demo) get the slim site header, every
 * in-app route gets the AppShell. Both share the toast provider.
 */
export function ShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  return (
    <ToastProvider>
      {isBareRoute(pathname) ? (
        <>
          <SiteHeader />
          <div id="content">{children}</div>
        </>
      ) : (
        <AppShell>{children}</AppShell>
      )}
    </ToastProvider>
  );
}
