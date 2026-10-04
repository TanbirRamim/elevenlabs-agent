import type { Metadata } from "next";
import { VoiceProvider } from "@/lib/voice";
import { CaptureSession } from "./CaptureSession";

export const metadata: Metadata = { title: "Capture · Shadow" };

export default function CapturePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-12">
      <header className="max-w-[40rem]">
        <p className="font-mono text-sm text-ink-faint">01</p>
        <h1 className="mt-1 font-display text-[2.75rem] leading-none font-normal tracking-[-0.025em] sm:text-[3.25rem]">
          Capture
        </h1>
        <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
          Triage the tickets the way you always do and think aloud. Shadow stays quiet while you
          work and asks short questions at natural pauses.
        </p>
      </header>
      <VoiceProvider>
        <CaptureSession />
      </VoiceProvider>
    </main>
  );
}
