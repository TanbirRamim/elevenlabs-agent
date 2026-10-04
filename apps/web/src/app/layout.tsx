import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { ShellGate } from "@/components/shell/ShellGate";
import { THEME_INIT_SCRIPT } from "@/components/shell/theme";
import "./globals.css";
import { WakeBanner } from "@/components/shell/WakeBanner";

// UI: Inter (variable, with the optical-size axis so 24px+ headings use the Display cut).
const sans = Inter({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  variable: "--font-inter",
  display: "swap",
});

// Evidence: ids, timestamps, keys and frame references.
const mono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Singoda AI",
  description:
    "Singoda AI sits beside your senior support lead, asks why at the right moments, and teaches their judgment to the next hire.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set before paint by THEME_INIT_SCRIPT, so the server markup can differ.
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, first-party theme bootstrap; avoids a theme flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-ink antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-control focus:bg-raised focus:px-3 focus:py-2 focus:text-ui focus:shadow-overlay"
        >
          Skip to content
        </a>
        <WakeBanner />
        <ShellGate>{children}</ShellGate>
      </body>
    </html>
  );
}
