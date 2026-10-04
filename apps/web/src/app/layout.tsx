import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Newsreader,
} from "next/font/google";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/brand/SiteHeader";
import "./globals.css";

// Display: Newsreader, an optical-size serif drawn for reading news on screens.
const display = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

// Text: Atkinson Hyperlegible Next, drawn by the Braille Institute so similar glyphs never blur.
const text = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson",
  display: "swap",
  // next/font has no metrics for this family yet, so the size-adjusted fallback is skipped.
  adjustFontFallback: false,
});

// Evidence: timestamps, quotes metadata and keys share the same family's mono cut.
const mono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson-mono",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Shadow",
  description:
    "Shadow sits beside your senior support lead, asks why at the right moments, and teaches their judgment to the next hire.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1720" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-canvas font-sans text-ink antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
