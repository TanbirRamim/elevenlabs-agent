"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "../brand/SiteHeader";
import { ToastProvider } from "../ui";
import { AppShell } from "./AppShell";
import { isBareRoute, isNakedRoute } from "./nav";

/**
 * Picks the frame for a route: marketing pages (/, /demo) get the slim site header, the
 * capture and teach pages get no chrome at all (they play a standalone ticketing product with Singoda AI
 * floating over it), every other in-app route gets the AppShell. All share the toasts.
 */
export function ShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  return (
    <ToastProvider>
      {isNakedRoute(pathname) ? (
        <div id="content">{children}</div>
      ) : isBareRoute(pathname) ? (
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
